CREATE TABLE `components` (
	`sku` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`manufacturer` text NOT NULL,
	`release_year` integer NOT NULL,
	`original_msrp` real,
	`currency` text DEFAULT 'USD' NOT NULL,
	`specs` text NOT NULL,
	`median_market_price` real DEFAULT 0 NOT NULL,
	`fair_value_score` real DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `components_category_idx` ON `components` (`category`);--> statement-breakpoint
CREATE INDEX `components_manufacturer_idx` ON `components` (`manufacturer`);--> statement-breakpoint
CREATE INDEX `components_release_year_idx` ON `components` (`release_year`);--> statement-breakpoint
CREATE TABLE `contributors` (
	`contributor_hash` text PRIMARY KEY NOT NULL,
	`contributor_id` text NOT NULL,
	`tier` text DEFAULT 'anonymous' NOT NULL,
	`trust_score` integer DEFAULT 0 NOT NULL,
	`verified_submissions` integer DEFAULT 0 NOT NULL,
	`last_approved_at` integer
);
--> statement-breakpoint
CREATE TABLE `price_observations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sku` text NOT NULL,
	`observed_at` integer NOT NULL,
	`price` real NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`source_type` text,
	`store_id` text,
	FOREIGN KEY (`sku`) REFERENCES `components`(`sku`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `price_observations_sku_observed_idx` ON `price_observations` (`sku`,`observed_at`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`submission_id` text PRIMARY KEY NOT NULL,
	`contributor_hash` text NOT NULL,
	`contributor_id` text NOT NULL,
	`contributor_tier` text DEFAULT 'anonymous' NOT NULL,
	`sku` text NOT NULL,
	`component_name` text NOT NULL,
	`manufacturer` text NOT NULL,
	`release_year` integer NOT NULL,
	`category` text NOT NULL,
	`specs` text NOT NULL,
	`reported_price` real NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`proof_url` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`submitted_at` integer NOT NULL,
	`reviewed_at` integer,
	`denial_reason` text,
	`auto_accepted` integer DEFAULT false NOT NULL,
	`decision_note` text
);
--> statement-breakpoint
CREATE INDEX `submissions_status_submitted_idx` ON `submissions` (`status`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `submissions_contributor_hash_idx` ON `submissions` (`contributor_hash`);--> statement-breakpoint
CREATE INDEX `submissions_sku_idx` ON `submissions` (`sku`);