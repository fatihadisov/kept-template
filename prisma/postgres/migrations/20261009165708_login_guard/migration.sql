-- CreateTable
CREATE TABLE "LoginGuard" (
    "id" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastTryAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LoginGuard_pkey" PRIMARY KEY ("id")
);

