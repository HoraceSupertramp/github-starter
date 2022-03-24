#!/usr/bin/env node
import util from 'util';
import fs from 'fs/promises';
import child_process from 'child_process';
import path from 'path';
import glob from 'glob';
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

interface Range {
    startIndex: number;
    endIndex: number;
}

interface Match {
    left: Range;
    right: Range;
    lines: string[];
}

function getLines(text: string) {
    return text.split(/\r?\n/);
}

function contains(range1: Range, range2: Range) {
    return range1.endIndex >= range2.endIndex && range1.startIndex <= range2.startIndex;
}

function isIncluded(match1: Match, match2: Match) {
    return contains(match2.left, match1.left) && contains(match2.right, match1.right);
}

function getDifferentCharacters(word: string) {
    return word.split('').reduce((total, char, index, characters) => {
        return characters.slice(0, index).some(character => character === char)
            ? total
            : total + 1;
    }, 0);
}

function isOverlapping(match1: Match, match2: Match) {
    return ((
            match1.left.endIndex === match2.left.endIndex &&
            match1.left.startIndex === match2.left.startIndex
        ) || (
            match1.right.endIndex === match2.right.endIndex &&
            match1.right.startIndex === match2.right.startIndex
        )
    );
}

async function compareFiles(file1: string, file2: string) {
    const contents1 = getLines(await fs.readFile(file1, 'utf-8'));
    const contents2 = getLines(await fs.readFile(file2, 'utf-8'));
    const matches: Match[] = [];
    for (let i = 0; i < contents1.length; i++) {
        for (let j = 0; j < contents2.length; j++) {
            if (contents1[i] === contents2[j]) {
                let match: Match = {
                    left: {
                        startIndex: i,
                        endIndex: i,
                    },
                    right: {
                        startIndex: j,
                        endIndex: j,
                    },
                    lines: [
                        contents1[i],
                    ],
                };
                for (let ti = i + 1, tj = j + 1; ti < contents1.length && tj < contents2.length; ti++, tj++) {
                    if (contents1[ti] === contents2[tj]) {
                        match.left.endIndex = ti;
                        match.right.endIndex = tj;
                        match.lines.push(contents1[ti]);
                    } else {
                        break;
                    }
                }
                matches.push(match);
            }
        }
    }
    return matches
        .filter((match, index, array) => (
            match.lines.length !== 0 &&
            match.lines.some(line => line !== '') && (
                match.lines.length > 2 ||
                getDifferentCharacters(match.lines[0]) >= 3
            ) &&
            !array.some(otherMatch => otherMatch !== match && isOverlapping(match, otherMatch))
        ))
        .reduce((matches, match) => {
            const notIncluded = matches.filter(previousMatch => !isIncluded(previousMatch, match));
            return notIncluded.concat(
                notIncluded.some(notIncludedMatch => isIncluded(match, notIncludedMatch))
                    ? []
                    : [match]
            );
        }, [] as Match[])
        .sort((diff1, diff2) => {
            return diff2.lines.length - diff1.lines.length;
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
                            const isSingleLine = change.left.startIndex === change.left.endIndex;
                            const isExact = (
                                change.left.startIndex === change.right.startIndex &&
                                change.left.endIndex === change.right.endIndex
                            );
                            console.log([
                                isSingleLine ? 'line '.blue : 'lines '.blue,
                                isSingleLine
                                    ? String(change.left.startIndex + 1).blue
                                    : [
                                        String(change.left.startIndex + 1).blue,
                                        ' --> ',
                                        String(change.left.endIndex + 1).blue,
                                    ].join(''),
                                ' ============================= '.yellow,
                                isSingleLine ? 'line '.blue : 'lines '.blue,
                                isSingleLine
                                    ? String(change.right.startIndex + 1).blue
                                    : [
                                        String(change.right.startIndex + 1).blue,
                                        ' --> ',
                                        String(change.right.endIndex + 1).blue,
                                    ].join(''),
                                ' ',
                                isExact ? 'EXACT'.bgCyan : ''
                            ].join(''));
                            console.log(change.lines.join('\n') + '\n');
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