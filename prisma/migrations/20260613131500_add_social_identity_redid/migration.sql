-- AlterTable: 小红书号 redId 与平台 user_id 区分存储
ALTER TABLE "SocialIdentity" ADD COLUMN "redId" TEXT;
