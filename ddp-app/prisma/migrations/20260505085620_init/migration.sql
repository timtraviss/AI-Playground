-- CreateTable
CREATE TABLE "Act" (
    "id" SERIAL NOT NULL,
    "shortTitle" TEXT NOT NULL,
    "workId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "versionDate" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Act_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Section" (
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
CREATE TABLE "Question" (
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
CREATE TABLE "MarkingRun" (
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
CREATE TABLE "CriterionResult" (
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
CREATE UNIQUE INDEX "Act_workId_key" ON "Act"("workId");

-- CreateIndex
CREATE UNIQUE INDEX "Section_actId_number_key" ON "Section"("actId", "number");

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_actId_fkey" FOREIGN KEY ("actId") REFERENCES "Act"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarkingRun" ADD CONSTRAINT "MarkingRun_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionResult" ADD CONSTRAINT "CriterionResult_markingRunId_fkey" FOREIGN KEY ("markingRunId") REFERENCES "MarkingRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
