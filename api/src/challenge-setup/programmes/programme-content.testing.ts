import {
  findProgramme,
  programmeContent,
} from "./programme-content";
import {
  findProgrammeTask,
  tasksForProgramme,
  tasksForWeek,
} from "./programme-task-content";
import type { Programme } from "./programme-content";
import type { ProgrammeContentReader } from "./programme-content.repository";

const programmeKeyForVersion = (programmeVersionId: string): string | undefined =>
  programmeContent.find(
    (programme) => programmeVersionId === `${programme.id}-v1`,
  )?.id;

const programmeForVersion = (programmeVersionId: string): Programme | undefined => {
  const key = programmeKeyForVersion(programmeVersionId);
  return key ? findProgramme(key) : undefined;
};

// Unit and event tests deliberately keep the old deterministic catalogue as a
// fixture. Production modules inject ProgrammeContentRepository instead.
function withIdentity(programme: Programme) {
  return { programme, sourceDocumentId: programme.id };
}

export const staticProgrammeContentReader: ProgrammeContentReader = {
  findProgramme: async (key) => findProgramme(key),
  findProgrammeWithIdentity: async (key) => {
    const programme = findProgramme(key);
    return programme ? withIdentity(programme) : undefined;
  },
  listActiveProgrammes: async () => programmeContent.filter(Boolean),
  // The fixture catalogue is keyed by slug and carries no separate mirror
  // document id, so identity is the slug on both sides.
  listActiveProgrammesWithIdentity: async () =>
    programmeContent
      .filter(Boolean)
      .map((programme) => ({ programme, sourceDocumentId: programme.id })),
  tasksForProgramme: async (key) => tasksForProgramme(key),
  tasksForProgrammeDay: async (programmeKey, dayNumber) =>
    tasksForProgramme(programmeKey).filter((task) => task.dayNumber === dayNumber),
  findProgrammeTask: async (programmeKey, taskKey) =>
    findProgrammeTask(programmeKey, taskKey),
  tasksForWeek: async (programmeKey, weekIndex) =>
    tasksForWeek(programmeKey, weekIndex),
  modulesForProgramme: async () => [],
  lessonsForModule: async () => [],
  contentForProgramme: async (key) => {
    const programme = findProgramme(key);
    return programme
      ? {
          programme,
          modules: [],
          tasks: tasksForProgramme(key),
        }
      : undefined;
  },
  findProgrammeVersion: async (programmeVersionId) =>
    programmeForVersion(programmeVersionId),
  findProgrammeVersionWithIdentity: async (programmeVersionId) => {
    const programme = programmeForVersion(programmeVersionId);
    return programme ? withIdentity(programme) : undefined;
  },
  tasksForProgrammeVersion: async (programmeVersionId) => {
    const key = programmeKeyForVersion(programmeVersionId);
    return key ? tasksForProgramme(key) : [];
  },
  tasksForProgrammeDayVersion: async (programmeVersionId, dayNumber) => {
    const key = programmeKeyForVersion(programmeVersionId);
    return key
      ? tasksForProgramme(key).filter((task) => task.dayNumber === dayNumber)
      : [];
  },
  findProgrammeTaskForVersion: async (programmeVersionId, taskKey) => {
    const key = programmeKeyForVersion(programmeVersionId);
    return key ? findProgrammeTask(key, taskKey) : undefined;
  },
  tasksForWeekVersion: async (programmeVersionId, weekIndex) => {
    const key = programmeKeyForVersion(programmeVersionId);
    return key ? tasksForWeek(key, weekIndex) : [];
  },
  modulesForProgrammeVersion: async () => [],
  lessonsForModuleVersion: async () => [],
  contentForProgrammeVersion: async (programmeVersionId) => {
    const key = programmeKeyForVersion(programmeVersionId);
    const programme = key ? findProgramme(key) : undefined;
    return programme
      ? {
          programme,
          modules: [],
          tasks: key ? tasksForProgramme(key) : [],
        }
      : undefined;
  },
};

export { programmeContent };

// Service tests need to control which slugs are published and to assert that
// the publication gate was (or was not) consulted. Everything other than
// findProgramme delegates to the static reader above, because the assignment
// path never reads tasks, modules or lessons.
export class RecordingProgrammeContentReader implements ProgrammeContentReader {
  readonly lookups: string[] = [];

  // The publication gate is the only caller that passes the caller's
  // transaction, so the presence of a queryable separates "assignment checked
  // this slug before committing" from the Welcome/status read of the same
  // slug afterwards. Tests about the gate assert on this list.
  readonly transactionalLookups: string[] = [];

  readonly transactionalVersionLookups: string[] = [];

  private readonly published: Set<string>;

  constructor(published: readonly string[] = []) {
    this.published = new Set(published);
  }

  async findProgramme(
    key: string,
    queryable?: unknown,
  ): Promise<Programme | undefined> {
    this.lookups.push(key);

    if (queryable !== undefined) {
      this.transactionalLookups.push(key);
    }

    if (!this.published.has(key)) {
      return undefined;
    }

    const programme = findProgramme(key);

    if (!programme) {
      throw new Error(
        `Test fixture error: "${key}" was declared published but is not in the catalogue.`,
      );
    }

    return programme;
  }

  async findProgrammeVersion(
    programmeVersionId: string,
    queryable?: unknown,
  ): Promise<Programme | undefined> {
    this.transactionalVersionLookups.push(programmeVersionId);
    const key = programmeKeyForVersion(programmeVersionId);

    if (queryable !== undefined && key) {
      this.transactionalLookups.push(key);
    }

    return key && this.published.has(key) ? findProgramme(key) : undefined;
  }

  findProgrammeWithIdentity =
    staticProgrammeContentReader.findProgrammeWithIdentity;
  findProgrammeVersionWithIdentity =
    staticProgrammeContentReader.findProgrammeVersionWithIdentity;

  tasksForProgramme = staticProgrammeContentReader.tasksForProgramme;
  listActiveProgrammes = staticProgrammeContentReader.listActiveProgrammes;
  listActiveProgrammesWithIdentity =
    staticProgrammeContentReader.listActiveProgrammesWithIdentity;
  tasksForProgrammeDay = staticProgrammeContentReader.tasksForProgrammeDay;
  findProgrammeTask = staticProgrammeContentReader.findProgrammeTask;
  tasksForWeek = staticProgrammeContentReader.tasksForWeek;
  modulesForProgramme = staticProgrammeContentReader.modulesForProgramme;
  lessonsForModule = staticProgrammeContentReader.lessonsForModule;
  contentForProgramme = staticProgrammeContentReader.contentForProgramme;
  tasksForProgrammeVersion = staticProgrammeContentReader.tasksForProgrammeVersion;
  tasksForProgrammeDayVersion =
    staticProgrammeContentReader.tasksForProgrammeDayVersion;
  findProgrammeTaskForVersion =
    staticProgrammeContentReader.findProgrammeTaskForVersion;
  tasksForWeekVersion = staticProgrammeContentReader.tasksForWeekVersion;
  modulesForProgrammeVersion =
    staticProgrammeContentReader.modulesForProgrammeVersion;
  lessonsForModuleVersion = staticProgrammeContentReader.lessonsForModuleVersion;
  contentForProgrammeVersion =
    staticProgrammeContentReader.contentForProgrammeVersion;
}
