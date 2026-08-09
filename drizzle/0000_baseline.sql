CREATE TABLE `coach_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text DEFAULT 'shreet' NOT NULL,
	`week_start` text NOT NULL,
	`markdown` text NOT NULL,
	`created_at` text NOT NULL,
	`dismissed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `coach_user_week_idx` ON `coach_reports` (`user_id`,`week_start`);--> statement-breakpoint
CREATE TABLE `concepts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text DEFAULT 'shreet' NOT NULL,
	`slug` text NOT NULL,
	`display` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `concepts_user_slug_idx` ON `concepts` (`user_id`,`slug`);--> statement-breakpoint
CREATE TABLE `list_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`list_id` integer NOT NULL,
	`position` integer NOT NULL,
	`lc_slug` text NOT NULL,
	`title` text NOT NULL,
	`difficulty` text,
	`url` text,
	`pattern` text,
	`problem_id` integer,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `list_items_list_slug_idx` ON `list_items` (`list_id`,`lc_slug`);--> statement-breakpoint
CREATE INDEX `list_items_list_pos_idx` ON `list_items` (`list_id`,`position`);--> statement-breakpoint
CREATE TABLE `lists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text DEFAULT 'shreet' NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`attribution` text,
	`source` text DEFAULT 'curated' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lists_user_slug_idx` ON `lists` (`user_id`,`slug`);--> statement-breakpoint
CREATE TABLE `problem_concepts` (
	`problem_id` integer NOT NULL,
	`concept_id` integer NOT NULL,
	PRIMARY KEY(`problem_id`, `concept_id`),
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `problems` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text DEFAULT 'shreet' NOT NULL,
	`slug` text NOT NULL,
	`lc_slug` text,
	`number` integer,
	`title` text NOT NULL,
	`url` text,
	`difficulty` text,
	`patterns` text DEFAULT '[]' NOT NULL,
	`language` text,
	`brute_force` text,
	`optimal` text,
	`key_insight` text,
	`tips` text DEFAULT '[]' NOT NULL,
	`fundamentals_missing` text DEFAULT '[]' NOT NULL,
	`raw_summary` text,
	`revise` integer DEFAULT true NOT NULL,
	`first_solved_at` text NOT NULL,
	`created_at` text NOT NULL,
	`fsrs_card` text,
	`due` text,
	`state` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `problems_user_slug_idx` ON `problems` (`user_id`,`slug`);--> statement-breakpoint
CREATE TABLE `problems_catalog` (
	`lc_slug` text PRIMARY KEY NOT NULL,
	`number` integer,
	`title` text,
	`difficulty` text,
	`patterns` text DEFAULT '[]' NOT NULL,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text DEFAULT 'shreet' NOT NULL,
	`problem_id` integer NOT NULL,
	`reviewed_at` text NOT NULL,
	`tier` text NOT NULL,
	`solved` text,
	`hints_used` integer,
	`recall_speed` text,
	`pre_confidence` integer,
	`post_confidence` integer,
	`time_to_approach_sec` integer,
	`time_to_code_min` real,
	`issues` text DEFAULT '[]' NOT NULL,
	`issue_tags` text DEFAULT '[]' NOT NULL,
	`grade` text NOT NULL,
	`grade_source` text DEFAULT 'derived' NOT NULL,
	`notes` text,
	`fsrs_snapshot` text,
	`next_due` text,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`user_id` text DEFAULT 'shreet' NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`user_id`, `key`)
);
