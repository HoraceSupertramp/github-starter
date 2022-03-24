#!/usr/bin/env node
import util from 'util';
import fs from 'fs/promises';
import child_process from 'child_process';
import path from 'path';
import glob from 'glob';
import * as diff from 'diff';
import dotenv from 'dotenv';
import 'colors';
const exec = util.promisify(child_process.exec);

interface Student {
    githubId: string;
}

type Delivery = string;

interface CopyTestOptions {
    students: Student[];
    delivery: Delivery;
}

function getStudentFolder(
    student: Student,
) {
    return path.resolve(process.env.DATA!, 'students', student.githubId);
}

function getStudentDeliveriesFolder(
    student: Student,
) {
    return path.resolve(getStudentFolder(student), 'deliveries');
}

function getStudentDeliveryFolder(
    student: Student,
    delivery: Delivery,
) {
    return path.resolve(getStudentDeliveriesFolder(student), delivery);
}

async function cloneRepo(
    student: Student,
    delivery: Delivery,
) {
    const folder = getStudentDeliveriesFolder(student);
    await fs.mkdir(folder, { recursive: true });
    console.log(`Cloning ${delivery} ${student.githubId}`.green);
    const command = `git -C ${folder} clone https://github.com/${student.githubId}/${delivery}.git`;
    await exec(command);
}

async function updateDelivery(
    student: Student,
    delivery: Delivery,
) {
    const folder = getStudentDeliveryFolder(student, delivery);
    console.log(`Pulling ${delivery} ${student.githubId}`.green);
    const command = `git -C ${folder} pull`;
    await exec(command);
}

async function compareFiles(file1: string, file2: string) {
    const contents1 = await fs.readFile(file1);
    const contents2 = await fs.readFile(file2);
    for (const part of diff.diffTrimmedLines(contents1.toString(), contents2.toString())) {
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
    const deliveryPath = getStudentDeliveryFolder(student, delivery);
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

async function getStudentDeliveryFiles(student: Student, delivery: Delivery, extension: string) {
    return glob.sync(path.resolve(getStudentDeliveryFolder(student, delivery), '**', `*.${extension}`));
}

/***
 * Runs a copy test on two different students' deliveries of the same delivery.
 */
async function copyTest({
    students,
    delivery,
}: CopyTestOptions) {
    dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
    for (let i = 0; i < students.length; i++) {
        await syncronizeStudentDelivery(students[i], delivery);
    }
    for (let i = 0; i < students.length; i++) {
        for (let j = i + 1; j < students.length; j++) {
            for (const type of ['js', 'html', 'css']) {
                const copyingStudent = students[i];
                const copiedStudent = students[j];
                for (const copyingStudentFile of await getStudentDeliveryFiles(copyingStudent, delivery, type)) {
                    for (const copiedStudentFile of await getStudentDeliveryFiles(copiedStudent, delivery, type)) {
                        const relativeCopyingPath = copyingStudentFile.replace(
                            getStudentDeliveryFolder(copyingStudent, delivery),
                            copyingStudent.githubId
                        );
                        const relativeCopiedPath = copiedStudentFile.replace(
                            getStudentDeliveryFolder(copiedStudent, delivery),
                            copiedStudent.githubId
                        );
                        console.log(`Comparing ${relativeCopyingPath} with ${relativeCopiedPath}`.red);
                        await compareFiles(copyingStudentFile, copiedStudentFile);
                    }
                }
            }
        }
    }
}

(async() => {
    try {
        await copyTest({
            delivery: process.argv[2],
            students: process.argv.slice(3).map(githubId => ({ githubId })),
        });
    } catch(error) {
        console.error(error);
        process.exit(1);
    }
})();