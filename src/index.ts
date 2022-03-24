#!/usr/bin/env node
import util from 'util';
import fs from 'fs/promises';
import child_process from 'child_process';
import moment from 'moment';

(async() => {
    try {
        const exec = util.promisify(child_process.exec);
        const studentGithubId = process.argv[2];
        const exerciseName = process.argv[3];
        const id = `${studentGithubId}-${exerciseName}-${moment().format('DD-MM-YYYY')}`;
        const folder = `./data/clones/${id}`;
        console.log(`Cloning https://github.com/${studentGithubId}/${exerciseName}.git into ${folder}`);
        await fs.mkdir(folder, { recursive: true });
        await exec(`git -C ${folder} clone https://github.com/${studentGithubId}/${exerciseName}.git`);
    } catch(error) {
        console.error(error);
        process.exit(1);
    }
})();