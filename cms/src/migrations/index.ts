import * as engineRulePriority from './20261027_120000_engine_rule_priority';
import * as migration_20260715_191132_initial from './20260715_191132_initial';
import * as migration_20260720_094611_content_mirror_jobs from './20260720_094611_content_mirror_jobs';
import * as migration_20260721_205539_engine_rule_authoring from './20260721_205539_engine_rule_authoring';
import * as migration_20260808_084155_first_take_content_model from './20260808_084155_first_take_content_model';
import * as migration_20260827_132946_matching_setups from './20260827_132946_matching_setups';
import * as migration_20260827_143417_user_roles from './20260827_143417_user_roles';
import * as migration_20260827_213523_programme_lifecycle from './20260827_213523_programme_lifecycle';
import * as migration_20260907_123740_task_card_authored_fields from './20260907_123740_task_card_authored_fields';
import * as migration_20260909_103813_programme_access_flag from './20260909_103813_programme_access_flag';
import * as migration_20260911_120000_subscription_trigger_events from './20260911_120000_subscription_trigger_events';
import * as migration_20260911_121000_programme_tier_gates from './20260911_121000_programme_tier_gates';
import * as migration_20260914_114429_lesson_minimum_tier from './20260914_114429_lesson_minimum_tier';
import * as migration_20260914_114432_drop_lesson_paid_only from './20260914_114432_drop_lesson_paid_only';
import * as migration_20260918_095145 from './20260918_095145';

export const migrations = [
  {
    up: migration_20260715_191132_initial.up,
    down: migration_20260715_191132_initial.down,
    name: '20260715_191132_initial',
  },
  {
    up: migration_20260720_094611_content_mirror_jobs.up,
    down: migration_20260720_094611_content_mirror_jobs.down,
    name: '20260720_094611_content_mirror_jobs',
  },
  {
    up: migration_20260721_205539_engine_rule_authoring.up,
    down: migration_20260721_205539_engine_rule_authoring.down,
    name: '20260721_205539_engine_rule_authoring',
  },
  {
    up: migration_20260808_084155_first_take_content_model.up,
    down: migration_20260808_084155_first_take_content_model.down,
    name: '20260808_084155_first_take_content_model',
  },
  {
    up: migration_20260827_132946_matching_setups.up,
    down: migration_20260827_132946_matching_setups.down,
    name: '20260827_132946_matching_setups',
  },
  {
    up: migration_20260827_143417_user_roles.up,
    down: migration_20260827_143417_user_roles.down,
    name: '20260827_143417_user_roles',
  },
  {
    up: migration_20260827_213523_programme_lifecycle.up,
    down: migration_20260827_213523_programme_lifecycle.down,
    name: '20260827_213523_programme_lifecycle',
  },
  {
    up: migration_20260907_123740_task_card_authored_fields.up,
    down: migration_20260907_123740_task_card_authored_fields.down,
    name: '20260907_123740_task_card_authored_fields',
  },
  {
    up: migration_20260909_103813_programme_access_flag.up,
    down: migration_20260909_103813_programme_access_flag.down,
    name: '20260909_103813_programme_access_flag',
  },
  {
    up: migration_20260911_120000_subscription_trigger_events.up,
    down: migration_20260911_120000_subscription_trigger_events.down,
    name: '20260911_120000_subscription_trigger_events',
  },
  {
    up: migration_20260911_121000_programme_tier_gates.up,
    down: migration_20260911_121000_programme_tier_gates.down,
    name: '20260911_121000_programme_tier_gates',
  },
  {
    up: migration_20260914_114429_lesson_minimum_tier.up,
    down: migration_20260914_114429_lesson_minimum_tier.down,
    name: '20260914_114429_lesson_minimum_tier',
  },
  {
    up: migration_20260914_114432_drop_lesson_paid_only.up,
    down: migration_20260914_114432_drop_lesson_paid_only.down,
    name: '20260914_114432_drop_lesson_paid_only',
  },
  {
    up: migration_20260918_095145.up,
    down: migration_20260918_095145.down,
    name: '20260918_095145'
  },
  { up: engineRulePriority.up, down: engineRulePriority.down, name: '20261027_120000_engine_rule_priority' },
];
