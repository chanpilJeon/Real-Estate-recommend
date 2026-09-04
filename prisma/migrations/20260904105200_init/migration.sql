-- CreateTable
CREATE TABLE `regions` (
    `code` CHAR(10) NOT NULL,
    `sigungu_code` CHAR(5) NOT NULL,
    `sido` VARCHAR(20) NOT NULL,
    `sigungu` VARCHAR(30) NOT NULL,
    `dong` VARCHAR(30) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,

    INDEX `regions_sigungu_code_idx`(`sigungu_code`),
    INDEX `regions_sido_sigungu_idx`(`sido`, `sigungu`),
    FULLTEXT INDEX `regions_sido_sigungu_dong_idx`(`sido`, `sigungu`, `dong`),
    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `region_aliases` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `alias` VARCHAR(30) NOT NULL,
    `region_code` CHAR(10) NOT NULL,

    INDEX `region_aliases_alias_idx`(`alias`),
    UNIQUE INDEX `region_aliases_alias_region_code_key`(`alias`, `region_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `complexes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kapt_code` VARCHAR(20) NULL,
    `name` VARCHAR(100) NOT NULL,
    `name_normalized` VARCHAR(100) NOT NULL,
    `region_code` CHAR(10) NOT NULL,
    `address` VARCHAR(200) NOT NULL,
    `lat` DECIMAL(10, 7) NULL,
    `lng` DECIMAL(10, 7) NULL,
    `households` INTEGER NOT NULL DEFAULT 0,
    `building_count` INTEGER NOT NULL DEFAULT 0,
    `approval_date` DATE NULL,
    `built_year` INTEGER NULL,
    `parking_count` INTEGER NOT NULL DEFAULT 0,
    `heating_type` VARCHAR(30) NULL,
    `nearest_subway_m` INTEGER NULL,
    `nearest_school_m` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `complexes_kapt_code_key`(`kapt_code`),
    INDEX `complexes_region_code_idx`(`region_code`),
    INDEX `complexes_built_year_idx`(`built_year`),
    INDEX `complexes_households_idx`(`households`),
    UNIQUE INDEX `complexes_region_code_name_normalized_built_year_key`(`region_code`, `name_normalized`, `built_year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `area_types` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `complex_id` INTEGER NOT NULL,
    `exclusive_sqm` DECIMAL(7, 2) NOT NULL,
    `supply_sqm` DECIMAL(7, 2) NULL,
    `rooms` INTEGER NULL,
    `bathrooms` INTEGER NULL,
    `household_cnt` INTEGER NULL,

    UNIQUE INDEX `area_types_complex_id_exclusive_sqm_key`(`complex_id`, `exclusive_sqm`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trades` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `complex_id` INTEGER NULL,
    `region_code` CHAR(10) NOT NULL,
    `raw_name` VARCHAR(100) NOT NULL,
    `exclusive_sqm` DECIMAL(7, 2) NOT NULL,
    `price_manwon` INTEGER NOT NULL,
    `contracted_at` DATE NOT NULL,
    `floor` INTEGER NOT NULL,
    `built_year` INTEGER NULL,
    `is_canceled` BOOLEAN NOT NULL DEFAULT false,
    `source_hash` CHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `trades_source_hash_key`(`source_hash`),
    INDEX `trades_complex_id_exclusive_sqm_contracted_at_idx`(`complex_id`, `exclusive_sqm`, `contracted_at`),
    INDEX `trades_region_code_contracted_at_idx`(`region_code`, `contracted_at`),
    INDEX `trades_contracted_at_idx`(`contracted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `rents` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `complex_id` INTEGER NULL,
    `region_code` CHAR(10) NOT NULL,
    `raw_name` VARCHAR(100) NOT NULL,
    `exclusive_sqm` DECIMAL(7, 2) NOT NULL,
    `deposit_manwon` INTEGER NOT NULL,
    `monthly_manwon` INTEGER NOT NULL DEFAULT 0,
    `contracted_at` DATE NOT NULL,
    `floor` INTEGER NOT NULL,
    `source_hash` CHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `rents_source_hash_key`(`source_hash`),
    INDEX `rents_complex_id_exclusive_sqm_contracted_at_idx`(`complex_id`, `exclusive_sqm`, `contracted_at`),
    INDEX `rents_region_code_contracted_at_idx`(`region_code`, `contracted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pois` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `category` VARCHAR(20) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `lat` DECIMAL(10, 7) NOT NULL,
    `lng` DECIMAL(10, 7) NOT NULL,
    `extra` JSON NULL,

    INDEX `pois_category_idx`(`category`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `match_failures` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `region_code` CHAR(10) NOT NULL,
    `raw_name` VARCHAR(100) NOT NULL,
    `built_year` INTEGER NULL,
    `occurrences` INTEGER NOT NULL DEFAULT 1,
    `candidates` JSON NULL,
    `resolved_complex_id` INTEGER NULL,
    `resolved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `match_failures_resolved_at_idx`(`resolved_at`),
    UNIQUE INDEX `match_failures_region_code_raw_name_built_year_key`(`region_code`, `raw_name`, `built_year`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `match_overrides` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `region_code` CHAR(10) NOT NULL,
    `raw_name` VARCHAR(100) NOT NULL,
    `complex_id` INTEGER NOT NULL,

    UNIQUE INDEX `match_overrides_region_code_raw_name_key`(`region_code`, `raw_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_profiles` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `user_id` INTEGER NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `price_min_manwon` INTEGER NULL,
    `price_max_manwon` INTEGER NULL,
    `area_min_sqm` DECIMAL(7, 2) NULL,
    `area_max_sqm` DECIMAL(7, 2) NULL,
    `min_built_year` INTEGER NULL,
    `min_households` INTEGER NULL,
    `preset` VARCHAR(20) NOT NULL DEFAULT 'value',
    `region_codes` JSON NOT NULL,

    INDEX `user_profiles_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `favorite_complexes` (
    `user_id` INTEGER NOT NULL,
    `complex_id` INTEGER NOT NULL,
    `memo` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`user_id`, `complex_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_users` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `password_hash` VARCHAR(60) NOT NULL,
    `must_change_password` BOOLEAN NOT NULL DEFAULT true,
    `failed_attempts` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `admin_users_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_sessions` (
    `token_hash` CHAR(64) NOT NULL,
    `admin_id` INTEGER NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `ip` VARCHAR(45) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_sessions_admin_id_idx`(`admin_id`),
    INDEX `admin_sessions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`token_hash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_runs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `job_name` VARCHAR(50) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `started_at` DATETIME(3) NOT NULL,
    `finished_at` DATETIME(3) NULL,
    `rows_inserted` INTEGER NOT NULL DEFAULT 0,
    `rows_updated` INTEGER NOT NULL DEFAULT 0,
    `error_message` TEXT NULL,
    `triggered_by` VARCHAR(20) NOT NULL DEFAULT 'cron',
    `params` JSON NULL,

    INDEX `job_runs_job_name_started_at_idx`(`job_name`, `started_at`),
    INDEX `job_runs_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `level` VARCHAR(10) NOT NULL,
    `context` VARCHAR(50) NOT NULL,
    `message` TEXT NOT NULL,
    `message_key` CHAR(32) NOT NULL,
    `meta` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `app_logs_level_created_at_idx`(`level`, `created_at`),
    INDEX `app_logs_message_key_created_at_idx`(`message_key`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `api_quota_usage` (
    `provider` VARCHAR(20) NOT NULL,
    `date` DATE NOT NULL,
    `used` INTEGER NOT NULL DEFAULT 0,
    `daily_limit` INTEGER NOT NULL,

    PRIMARY KEY (`provider`, `date`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `search_events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `region_code` CHAR(10) NOT NULL,
    `conditions` JSON NOT NULL,
    `result_count` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `search_events_region_code_created_at_idx`(`region_code`, `created_at`),
    INDEX `search_events_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `region_aliases` ADD CONSTRAINT `region_aliases_region_code_fkey` FOREIGN KEY (`region_code`) REFERENCES `regions`(`code`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `complexes` ADD CONSTRAINT `complexes_region_code_fkey` FOREIGN KEY (`region_code`) REFERENCES `regions`(`code`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `area_types` ADD CONSTRAINT `area_types_complex_id_fkey` FOREIGN KEY (`complex_id`) REFERENCES `complexes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trades` ADD CONSTRAINT `trades_complex_id_fkey` FOREIGN KEY (`complex_id`) REFERENCES `complexes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `rents` ADD CONSTRAINT `rents_complex_id_fkey` FOREIGN KEY (`complex_id`) REFERENCES `complexes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_profiles` ADD CONSTRAINT `user_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `favorite_complexes` ADD CONSTRAINT `favorite_complexes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_sessions` ADD CONSTRAINT `admin_sessions_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
