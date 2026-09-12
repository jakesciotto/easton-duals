CREATE TABLE `divisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`name` text NOT NULL,
	`format` text NOT NULL,
	`styles` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `divisions_event_idx` ON `divisions` (`event_id`);--> statement-breakpoint
CREATE TABLE `division_members` (
	`division_id` integer NOT NULL,
	`athlete_id` integer NOT NULL,
	`seed` integer NOT NULL,
	PRIMARY KEY(`division_id`, `athlete_id`),
	FOREIGN KEY (`division_id`) REFERENCES `divisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`athlete_id`) REFERENCES `athletes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `__new_match_events` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` integer NOT NULL,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`athlete_id` integer,
	`action_key` text,
	`points` integer,
	`payload` text,
	`at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_match_events`("id", "match_id", "seq", "type", "athlete_id", "action_key", "points", "payload", "at") SELECT "id", "match_id", "seq", "type", "athlete_id", "action_key", "points", "payload", "at" FROM `match_events`;--> statement-breakpoint
DROP TABLE `match_events`;--> statement-breakpoint
ALTER TABLE `__new_match_events` RENAME TO `match_events`;--> statement-breakpoint
CREATE UNIQUE INDEX `match_events_match_seq_idx` ON `match_events` (`match_id`,`seq`);--> statement-breakpoint
ALTER TABLE `matches` RENAME TO `__old_matches`;--> statement-breakpoint
CREATE TABLE `matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`mat_id` integer,
	`number` integer NOT NULL,
	`order_index` integer NOT NULL,
	`ruleset_id` integer NOT NULL,
	`length_sec` integer NOT NULL,
	`extension_ms` integer DEFAULT 0 NOT NULL,
	`athlete_a_id` integer,
	`athlete_b_id` integer,
	`feed_a_match_id` integer,
	`feed_a_take` text,
	`feed_b_match_id` integer,
	`feed_b_take` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`winner_athlete_id` integer,
	`win_type` text,
	`points_a` integer DEFAULT 0 NOT NULL,
	`points_b` integer DEFAULT 0 NOT NULL,
	`clock_elapsed_ms` integer DEFAULT 0 NOT NULL,
	`clock_started_at` text,
	`pending_terminal_athlete_id` integer,
	`pending_terminal_key` text,
	`last_seq` integer DEFAULT 0 NOT NULL,
	`why` text,
	`style` text DEFAULT 'gi' NOT NULL,
	`division_id` integer,
	`round` integer,
	`source` text DEFAULT 'designed' NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mat_id`) REFERENCES `mats`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`ruleset_id`) REFERENCES `rulesets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`athlete_a_id`) REFERENCES `athletes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`athlete_b_id`) REFERENCES `athletes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`feed_a_match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`feed_b_match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`division_id`) REFERENCES `divisions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `matches`("id", "event_id", "mat_id", "number", "order_index", "ruleset_id", "length_sec", "extension_ms", "athlete_a_id", "athlete_b_id", "status", "winner_athlete_id", "win_type", "points_a", "points_b", "clock_elapsed_ms", "clock_started_at", "pending_terminal_athlete_id", "pending_terminal_key", "last_seq", "why", "source") SELECT "id", "event_id", "mat_id", row_number() OVER (PARTITION BY "event_id" ORDER BY "order_index", "id"), "order_index", "ruleset_id", "length_sec", "extension_ms", "athlete_a_id", "athlete_b_id", "status", "winner_athlete_id", "win_type", "points_a", "points_b", "clock_elapsed_ms", "clock_started_at", "pending_terminal_athlete_id", "pending_terminal_key", "last_seq", "why", "source" FROM `__old_matches`;--> statement-breakpoint
DROP TABLE `__old_matches`;--> statement-breakpoint
CREATE INDEX `matches_event_order_idx` ON `matches` (`event_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `matches_mat_idx` ON `matches` (`mat_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `matches_event_number_idx` ON `matches` (`event_id`,`number`);--> statement-breakpoint
CREATE TABLE `__new_match_events` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` integer NOT NULL,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`athlete_id` integer,
	`action_key` text,
	`points` integer,
	`payload` text,
	`at` text NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_match_events`("id", "match_id", "seq", "type", "athlete_id", "action_key", "points", "payload", "at") SELECT "id", "match_id", "seq", "type", "athlete_id", "action_key", "points", "payload", "at" FROM `match_events`;--> statement-breakpoint
DROP TABLE `match_events`;--> statement-breakpoint
ALTER TABLE `__new_match_events` RENAME TO `match_events`;--> statement-breakpoint
CREATE UNIQUE INDEX `match_events_match_seq_idx` ON `match_events` (`match_id`,`seq`);--> statement-breakpoint
ALTER TABLE `proposals` ADD `style` text DEFAULT 'gi' NOT NULL;
