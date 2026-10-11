-- CreateTable
CREATE TABLE "LoginGuard" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastTryAt" DATETIME,
    "lockedUntil" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0
);

