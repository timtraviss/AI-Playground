-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ddp";

-- CreateTable
CREATE TABLE "ddp"."Act" (
    "id" SERIAL NOT NULL,
    "shortTitle" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "versionDate" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Act_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ddp"."Section" (
    "id" SERIAL NOT NULL,
    "actId" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "partHeading" TEXT,
    "fullText" TEXT NOT NULL,
    "rawXml" TEXT NOT NULL,
    CONSTRAINT "Section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ddp"."Question" (
    "id" SERIAL NOT NULL,
    "sectionId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "defaultGrade" DOUBLE PRECISION NOT NULL,
    "focusNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ddp"."MarkingRun" (
    "id" SERIAL NOT NULL,
    "questionId" INTEGER NOT NULL,
    "answerText" TEXT NOT NULL,
    "fileName" TEXT,
    "totalMark" DOUBLE PRECISION NOT NULL,
    "overallBand" TEXT NOT NULL,
    "overallFeedback" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarkingRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ddp"."CriterionResult" (
    "id" SERIAL NOT NULL,
    "markingRunId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "marksAvailable" DOUBLE PRECISION NOT NULL,
    "marksAwarded" DOUBLE PRECISION NOT NULL,
    "band" TEXT NOT NULL,
    "descriptor" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    CONSTRAINT "CriterionResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Act_workId_key" ON "ddp"."Act"("workId");

-- CreateIndex
CREATE UNIQUE INDEX "Section_actId_number_key" ON "ddp"."Section"("actId", "number");

-- AddForeignKey
ALTER TABLE "ddp"."Section" ADD CONSTRAINT "Section_actId_fkey" FOREIGN KEY ("actId") REFERENCES "ddp"."Act"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ddp"."Question" ADD CONSTRAINT "Question_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ddp"."Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ddp"."MarkingRun" ADD CONSTRAINT "MarkingRun_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ddp"."Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ddp"."CriterionResult" ADD CONSTRAINT "CriterionResult_markingRunId_fkey" FOREIGN KEY ("markingRunId") REFERENCES "ddp"."MarkingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
