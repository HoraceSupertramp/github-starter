#!/usr/bin/env node
import util from 'util';
import fs from 'fs/promises';
import child_process from 'child_process';
import moment from 'moment';
import path from 'path';
import glob from 'glob';
import * as diff from 'diff';
import dotenv from 'dotenv';
const exec = util.promisify(child_process.exec);

interface Student {
    githubId: string;
}

type Delivery = string;

interface CopyTestOptions {
    copiedStudent: Student;
    copyingStudent: Student;
    delivery: Delivery;
}

function getStudentFolder(
    student: Student,
) {
    return path.resolve(process.env.DATA!, 'students', student.githubId);
}

function getDeliveryFolder(
    student: Student,
    delivery: Delivery,
) {
    return path.resolve(getStudentFolder(student), delivery);
}

async function cloneRepo(
    student: Student,
    delivery: Delivery,
) {
    const folder = getStudentFolder(student);
    await fs.mkdir(folder, { recursive: true });
    console.log(`Cloning ${delivery} ${student.githubId}`);
    const command = `git -C ${folder} clone https://github.com/${student.githubId}/${delivery}.git`;
    await exec(command);
}

async function updateDelivery(
    student: Student,
    delivery: Delivery,
) {
    const folder = getDeliveryFolder(student, delivery);
    console.log(`Pulling ${delivery} ${student.githubId}`);
    const command = `git -C ${folder} pull`;
    await exec(command);
}

async function confrontFiles(file1: string, file2: string) {
    const contents1 = await fs.readFile(file1);
    const contents2 = await fs.readFile(file2);
    for (const part of diff.diffLines(contents1.toString(), contents2.toString())) {
        if (!part.added && !part.removed) {
            console.log(part.value);
        }
    }
}

async function exists(path: string) {
    try {
        await fs.access(path);
        return true;
    } catch (error) {
        return false;
    }
}

async function inspectDelivery(student: Student, delivery: Delivery) {
    const deliveryPath = getDeliveryFolder(student, delivery);
    return {
        exists: await exists(deliveryPath),
        isGitRepo: await isGitRepo(deliveryPath),
    };
}

async function isGitRepo(folder: string) {
    return await exists(path.resolve(folder, '.git'));
}

async function syncronizeStudentDelivery(student: Student, delivery: Delivery) {
    const deliveryPath = path.resolve(process.env.DATA!, 'students', student.githubId, delivery);
    const deliveryFolder = await inspectDelivery(student, delivery);
    if (deliveryFolder.exists) {
        if (deliveryFolder.isGitRepo) {
            await updateDelivery(student, delivery);
        } else {
            await fs.rm(deliveryPath, { recursive: true, force: true });
            await cloneRepo(student, delivery);
        }
    } else {
        await cloneRepo(student, delivery);
    }
}

/***
 * Runs a copy test on two different students' deliveries of the same delivery.
 */
async function copyTest({
    copiedStudent,
    copyingStudent,
    delivery,
}: CopyTestOptions) {
    dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
    const timestamp = moment().format('DD-MM-YYYY_HH-MM-SS');
    const baseTestFolder = path.resolve(process.env.DATA!, 'copy-tests', `${copyingStudent.githubId}-${copiedStudent.githubId}`);
    const clonesFolder = path.resolve(baseTestFolder, 'clones');
    const copyingStudentFolder = path.resolve(clonesFolder, copyingStudent.githubId);
    const copiedStudentFolder = path.resolve(clonesFolder, copiedStudent.githubId);
    await fs.mkdir(copyingStudentFolder, { recursive: true });
    await fs.mkdir(copiedStudentFolder, { recursive: true });
    await syncronizeStudentDelivery(
        copyingStudent,
        delivery,
    );
    await syncronizeStudentDelivery(
        copiedStudent,
        delivery,
    );
    const copyingStudentFiles = glob.sync(path.resolve(copyingStudentFolder, '**', '*.html'));
    const copiedStudentFiles = glob.sync(path.resolve(copiedStudentFolder, '**', '*.html'));
    for (const copyingStudentFile of copyingStudentFiles) {
        for (const copiedStudentFile of copiedStudentFiles) {
            await confrontFiles(copyingStudentFile, copiedStudentFile);
        }
    }
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
            delivery: process.argv[4]
        });
    } catch(error) {
        console.error(error);
        process.exit(1);
    }
})();