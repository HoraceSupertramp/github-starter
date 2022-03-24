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
    return diff.diffLines(contents1.toString(), contents2.toString(), {
        ignoreWhitespace: false,
        newlineIsToken: false,
    })
        .sort((diff1, diff2) => {
            return diff2.value.length - diff1.value.length;
        });
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

function getLine(text: string, chunk: string) {
    const index = text.indexOf(chunk);
    let characters = 0;
    let lineIndex = 0;
    const lines = text.split(/\r?\n/);
    while (lineIndex < lines.length && characters + lines[lineIndex].length < index) {
        characters += lines[lineIndex].length;
        lineIndex++;
    }
    return index + 1;
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
    console.log('\n');
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
                        console.log(`${relativeCopyingPath.red} ${'||'.yellow} ${relativeCopiedPath.red}`);
                        for (const change of await compareFiles(copyingStudentFile, copiedStudentFile)) {
                            if (!change.added && !change.removed) {
                                const copyingStudentText = await fs.readFile(copyingStudentFile, 'utf-8');
                                const copiedStudentText = await fs.readFile(copiedStudentFile, 'utf-8');
                                const copyingStudentLine = getLine(copyingStudentText, change.value)
                                const copiedStudentLine = getLine(copiedStudentText, change.value)
                                console.log(`${'line'.blue} ${String(copyingStudentLine).blue} ${'============================='.yellow} ${'line'.blue} ${String(copiedStudentLine).red}`);
                                console.log(change.value, '\n');
                            }
                        };
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