// TODO #22198
import cleanGitRef from 'clean-git-ref';
import slugify from 'slugify';
import type { RenovateConfig } from '../../../config/types';
import { logger } from '../../../logger';
import { hash } from '../../../util/hash';
import { regEx } from '../../../util/regex';
import * as template from '../../../util/template';

const MIN_HASH_LENGTH = 6;

const RE_MULTIPLE_DASH = regEx(/--+/g);

const RE_SPECIAL_CHARS_STRICT = regEx(/[`~!@#$%^&*()_=+[\]\\|{};':",.<>?/]/g);

/**
 * Clean git branch name
 *
 * Remove what clean-git-ref fails to:
 * - leading dot/leading dot after slash
 * - trailing dot
 * - whitespace
 * - special characters
 * - leading or trailing dashes
 * - chained dashes(breaks markdown comments) are replaced by single dash
 */
function cleanBranchName(
  branchName: string,
  branchPrefix: string,
  branchNameStrict?: boolean,
): string {
  let cleanedBranchName = branchName;

  let existingBranchPrefix = '';
  if (branchNameStrict) {
    if (cleanedBranchName.startsWith(branchPrefix)) {
      existingBranchPrefix = branchPrefix;
      cleanedBranchName = cleanedBranchName.slice(branchPrefix.length);
    }
    cleanedBranchName =
      existingBranchPrefix +
      cleanedBranchName.replace(RE_SPECIAL_CHARS_STRICT, '-'); // massage out all special characters that slip through slugify
  }

  return cleanGitRef
    .clean(cleanedBranchName)
    .replace(regEx(/^\.|\.$/), '') // leading or trailing dot
    .replace(regEx(/\/\./g), '/') // leading dot after slash
    .replace(regEx(/\s/g), '') // whitespace
    .replace(regEx(/[[\]?:\\^~]/g), '-') // massage out all these characters: [ ] ? : \ ^ ~
    .replace(regEx(/(^|\/)-+/g), '$1') // leading dashes
    .replace(regEx(/-+(\/|$)/g), '$1') // trailing dashes
    .replace(RE_MULTIPLE_DASH, '-'); // chained dashes
}

export function generateBranchName(update: RenovateConfig): void {
  // Check whether to use a group name
  const newMajor = String(update.newMajor);
  const newMinor = String(update.newMinor);
  if (!update.groupName && update.sharedVariableName) {
    logger.debug(
      `Using sharedVariableName=${update.sharedVariableName} as groupName for depName=${update.depName}`,
    );
    update.groupName = update.sharedVariableName;
  }
  if (update.groupName) {
    update.groupName = template.compile(update.groupName, update);
    logger.trace('Using group branchName template');
    // TODO: types (#22198)
    logger.trace(
      `Dependency ${update.depName!} is part of group ${update.groupName}`,
    );
    if (update.groupSlug) {
      update.groupSlug = template.compile(update.groupSlug, update);
    } else {
      update.groupSlug = update.groupName;
    }
    update.groupSlug = slugify(update.groupSlug, {
      lower: true,
    });
    if (update.updateType === 'major' && update.separateMajorMinor) {
      if (update.separateMultipleMajor) {
        update.groupSlug = `major-${newMajor}-${update.groupSlug}`;
      } else {
        update.groupSlug = `major-${update.groupSlug}`;
      }
    }
    if (update.updateType === 'minor' && update.separateMultipleMinor) {
      update.groupSlug = `minor-${newMajor}.${newMinor}-${update.groupSlug}`;
    }
    if (update.updateType === 'patch' && update.separateMinorPatch) {
      update.groupSlug = `patch-${update.groupSlug}`;
    }
    update.branchTopic = update.group!.branchTopic ?? update.branchTopic;
    update.branchName = update.group!.branchName ?? update.branchName;
  }

  if (update.hashedBranchLength) {
    let hashLength = update.hashedBranchLength - update.branchPrefix!.length;
    if (hashLength < MIN_HASH_LENGTH) {
      logger.warn(
        `\`hashedBranchLength\` must allow for at least ${MIN_HASH_LENGTH} characters hashing in addition to \`branchPrefix\`. Using ${MIN_HASH_LENGTH} character hash instead.`,
      );
      hashLength = MIN_HASH_LENGTH;
    }

    const additionalBranchPrefix = template.compile(
      String(update.additionalBranchPrefix ?? ''),
      update,
    );

    const branchTopic = template.compile(
      String(update.branchTopic ?? ''),
      update,
    );

    let hashInput = additionalBranchPrefix + branchTopic;

    // Compile extra times in case of nested templates
    hashInput = template.compile(hashInput, update);
    hashInput = template.compile(hashInput, update);

    const hashedInput = hash(hashInput);

    // TODO: types (#22198)
    update.branchName = `${update.branchPrefix!}${hashedInput.slice(
      0,
      hashLength,
    )}`;
  } else {
    update.branchName = template.compile(update.branchName!, update);

    // Compile extra times in case of nested templates
    update.branchName = template.compile(update.branchName, update);
    update.branchName = template.compile(update.branchName, update);
  }
  update.branchName = cleanBranchName(
    update.branchName,
    update.branchPrefix!,
    update.branchNameStrict,
  );
}
