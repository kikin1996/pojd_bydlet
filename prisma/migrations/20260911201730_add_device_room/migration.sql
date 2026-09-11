-- DropIndex
DROP INDEX "Device_propertyId_key";

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "room" TEXT NOT NULL DEFAULT 'Hlavní místnost';
