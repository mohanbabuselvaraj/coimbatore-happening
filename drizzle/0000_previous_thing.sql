CREATE TABLE `budgets` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `budgets_expiry` ON `budgets` (`expires_at`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`place` text NOT NULL,
	`lng` real NOT NULL,
	`lat` real NOT NULL,
	`created_at` integer NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`delete_hash` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `posts_created` ON `posts` (`created_at`);--> statement-breakpoint
CREATE TABLE `reports` (
	`post_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`post_id`, `token_hash`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`post_id` text NOT NULL,
	`token_hash` text NOT NULL,
	PRIMARY KEY(`post_id`, `token_hash`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
