CREATE TABLE `admin_history` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL,
	`before_json` text NOT NULL,
	`after_json` text NOT NULL,
	`revision` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `admin_history_post` ON `admin_history` (`post_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `posts` ADD `hidden_at` integer;--> statement-breakpoint
ALTER TABLE `posts` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `reports` ADD `resolution_id` text;