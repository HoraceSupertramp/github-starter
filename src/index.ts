#!/usr/bin/env node
import util from 'util';
import fs from 'fs/promises';
import child_process from 'child_process';
import moment from 'moment';
import path from 'path';

interface Student {
    githubId: string;
}

type Exercise = string;

interface CopyTestOptions {
    copiedStudent: Student;
    copyingStudent: Student;
    exercise: Exercise;
}

interface DownloadExerciseOptions {
    student: Student;
    exercise: Exercise;
    folder: string;
}

async function isGitRepo(folder: string) {
    try {
        fs.access(path.resolve(folder, '.git'));
        return true;
    } catch (error) {
        return false;
    }
}

async function updateExercise({
    student,
    exercise,
    folder,
}: DownloadExerciseOptions) {
    await fs.mkdir(folder, { recursive: true });
    const command = `git -C ${folder} clone https://github.com/${student.githubId}/${exercise}.git`;
    await util.promisify(child_process.exec)(command);
}

/***
 * Confronts two different students' deliveries of the same exercise.
 */
async function copyTest({
    copiedStudent,
    copyingStudent,
    exercise,
}: CopyTestOptions) {
    const timestamp = moment().format('DD-MM-YYYY_HH-MM-SS');
    const baseTestFolder = path.resolve('data', 'copyTests', `${copyingStudent.githubId}-${copiedStudent.githubId}-${timestamp}`);
    const clonesFolder = path.resolve(baseTestFolder, 'clones');
    const copyingStudentFolder = path.resolve(clonesFolder, copyingStudent.githubId);
    const copiedStudentFolder = path.resolve(clonesFolder, copiedStudent.githubId);
    await fs.mkdir(copyingStudentFolder, { recursive: true });
    await fs.mkdir(copiedStudentFolder, { recursive: true });
    await updateExercise({
        exercise,
        student: copyingStudent,
        folder: copyingStudentFolder,
    });
    await updateExercise({
        exercise,
        student: copiedStudent,
        folder: copiedStudentFolder,
    });
}

(async() => {
    try {
        await copyTest({
            copyingStudent: {
                githubId: process.argv[2],
            },
            copiedStudent: {
                githubId: process.argv[3],
            },
            exercise: process.argv[4]
        });
    } catch(error) {
        console.error(error);
        process.exit(1);
    }
})();