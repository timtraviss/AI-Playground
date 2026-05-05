-- CreateTable
CREATE TABLE "Act" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shortTitle" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "versionDate" DATETIME NOT NULL,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Section" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "actId" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "partHeading" TEXT,
    "fullText" TEXT NOT NULL,
    "rawXml" TEXT NOT NULL,
    CONSTRAINT "Section_actId_fkey" FOREIGN KEY ("actId") REFERENCES "Act" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Question" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sectionId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "defaultGrade" REAL NOT NULL,
    "focusNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Question_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarkingRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "questionId" INTEGER NOT NULL,
    "answerText" TEXT NOT NULL,
    "fileName" TEXT,
    "totalMark" REAL NOT NULL,
    "overallBand" TEXT NOT NULL,
    "overallFeedback" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarkingRun_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CriterionResult" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "markingRunId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "marksAvailable" REAL NOT NULL,
    "marksAwarded" REAL NOT NULL,
    "band" TEXT NOT NULL,
    "descriptor" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    CONSTRAINT "CriterionResult_markingRunId_fkey" FOREIGN KEY ("markingRunId") REFERENCES "MarkingRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Act_workId_key" ON "Act"("workId");

-- CreateIndex
CREATE UNIQUE INDEX "Section_actId_number_key" ON "Section"("actId", "number");
