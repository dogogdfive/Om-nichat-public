-- Add YouTube to platform enum (required for YouTube OAuth connections)
ALTER TYPE platform ADD VALUE IF NOT EXISTS 'youtube';
