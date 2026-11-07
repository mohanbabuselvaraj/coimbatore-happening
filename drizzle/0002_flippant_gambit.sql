CREATE TABLE `activity_daily` (
	`day` text NOT NULL,
	`location_key` text NOT NULL,
	`place` text NOT NULL,
	`lng` real,
	`lat` real,
	`views` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `location_key`)
);
--> statement-breakpoint
CREATE TABLE `activity_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` integer NOT NULL
);
