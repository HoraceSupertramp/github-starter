#!/usr/bin/env node
import util from 'util';
import fs from 'fs/promises';
import child_process, { spawn } from 'child_process';
import path from 'path';
import * as envfile from 'envfile';
import { Command } from 'commander';
import 'colors';

const exec = util.promisify(child_process.exec);

interface Config {
    data: string;
}

async function pathExists(path: string) {
    try {
        await fs.access(path);
        return true;
    } catch (error) {
        return false;
    }
}

function getStudentPath(student: string, config: Config) {
    return path.resolve(config.data, 'students', student);
}

function getDeliveriesPath(student: string, config: Config) {
    return path.resolve(getStudentPath(student, config), 'deliveries');
}

function getDeliveryPath(student: string, delivery: string, config: Config) {
    return path.resolve(getDeliveriesPath(student, config), delivery);
}

async function cloneDelivery(student: string, delivery: string, config: Config) {
    const folder = getDeliveriesPath(student, config);
    console.log(`Cloning ${delivery} ${student}`.green);
    await fs.mkdir(folder, { recursive: true });
    const command = `git -C ${folder} clone https://github.com/${student}/${delivery}.git`;
    await exec(command);
}

async function updateDelivery(student: string, delivery: string, config: Config) {
    const folder = getDeliveryPath(student, delivery, config);
    console.log(`Pulling ${delivery} ${student}`.green);
    const command = `git -C ${folder} pull`;
    await exec(command);
}

async function inspectDelivery(student: string, delivery: string, config: Config) {
    const deliveryPath = getDeliveryPath(student, delivery, config);
    return {
        exists: await pathExists(deliveryPath),
        isGitRepo: await pathExists(path.resolve(deliveryPath, '.git')),
    };
}

async function syncronizeDelivery(student: string, delivery: string, config: Config) {
    const deliveryPath = path.resolve(config.data, 'students', student, delivery);
    const deliveryFolder = await inspectDelivery(student, delivery, config);
    if (deliveryFolder.exists) {
        if (deliveryFolder.isGitRepo) {
            await updateDelivery(student, delivery, config);
        } else {
            await fs.rm(deliveryPath, { recursive: true, force: true });
            await cloneDelivery(student, delivery, config);
        }
    } else {
        await cloneDelivery(student, delivery, config);
    }
}

async function runCommand(command: string, folder: string, pipe: boolean) {
    return new Promise<void>((resolve, reject) => {
        const child = spawn(command.split(' ')[0], command.split(' ').slice(1), {
            cwd: folder,
            stdio: pipe ? 'inherit' : 'ignore'
        });
        child.on('error', () => {
            reject();
        });
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(code);
        });
    });
}

interface GlobalOptions {
    student: string;
    repo: string;
    npm: boolean;
    data?: string;
}

interface RunOptions {
    vue?: boolean;
    laravel?: boolean;
    run?: string;
}

(async() => {
    try {
        const program = new Command();
        program.requiredOption('-r, --repo <repo>');
        program.requiredOption('-s, --student <github_id>');
        program.option('-d, --data <path>');
        program.command('start')
            .description('clone one student\'s delivery and run a command within it')
            .option('--laravel')
            .option('--vue')
            .option('-r, --run <commands>')
            .action(async ({
                vue = false,
                laravel = false,
                run: userCommands
            }: RunOptions) => {
                try {
                    const {
                        student,
                        repo,
                        data = path.resolve(__dirname, '..', 'data'),
                    } = program.opts() as GlobalOptions;
                    const config: Config = { data };
                    const delivery = getDeliveryPath(student, repo, config);
                    await syncronizeDelivery(student, repo, config);
                    const commands = userCommands 
                        ? userCommands
                            .split('&&')
                            .map((command) => command.trim())
                        : [];
                    if (laravel) {
                        const dotenvExample = path.resolve(delivery, '.env.example');
                        const dotenv = path.resolve(delivery, '.env');
                        if (await pathExists(dotenvExample)) {
                            await fs.copyFile(dotenvExample, dotenv);
                        }
                        await runCommand(
                            'composer install',
                            delivery,
                            true
                        );
                        for (const command of commands) {
                            await runCommand(
                                command,
                                delivery,
                                true
                            );
                        }
                        if (await pathExists(dotenv)) {
                            const contents = envfile.parse(await fs.readFile(dotenv, 'utf-8'));
                            if (contents['APP_KEY'] == null || contents['APP_KEY'] === '') {
                                await runCommand(
                                    'php artisan key:generate',
                                    delivery,
                                    true
                                );
                            }
                        }
                        await runCommand(
                            'php artisan serve',
                            delivery,
                            true
                        );
                    }
                } catch(error) {
                    console.error('An error occurred', error);
                    process.exit(1);
                }
            });
        program.showHelpAfterError();
        await program.parseAsync(process.argv);
        
    } catch(error) {
        console.error(error);
        process.exit(1);
    }
})();