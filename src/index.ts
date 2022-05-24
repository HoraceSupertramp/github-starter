#!/usr/bin/env node
import util from 'util';
import fs from 'fs/promises';
import child_process from 'child_process';
import path from 'path';
import * as envfile from 'envfile';
import { Command } from 'commander';
import 'colors';

const exec = util.promisify(child_process.exec);

interface Config {
    data: string;
    projectScope?: string;
}

async function pathExists(path: string) {
    try {
        await fs.access(path);
        return true;
    } catch (error) {
        return false;
    }
}

function getUsersPath(user: string, config: Config) {
    return path.resolve(config.data, 'users', user);
}

function getReposPath(user: string, config: Config) {
    return path.resolve(getUsersPath(user, config), 'repos');
}

function getRepoPath(user: string, name: string, config: Config) {
    return path.resolve(getReposPath(user, config), name);
}

function getProjectFolder(user: string, name: string, config: Config) {
    if (config.projectScope != null) {
        return path.resolve(getRepoPath(user, name, config), config.projectScope);
    }
    return getRepoPath(user, name, config);
}

async function cloneRepo(user: string, repo: string, config: Config) {
    const folder = getReposPath(user, config);
    console.log(`Cloning ${repo} ${user}`.green);
    await fs.mkdir(folder, { recursive: true });
    const command = `git -C ${folder} clone https://github.com/${user}/${repo}.git`;
    await exec(command);
}

async function updateRepo(user: string, repo: string, config: Config) {
    const folder = getRepoPath(user, repo, config);
    console.log(`Pulling ${repo} ${user}`.green);
    const command = `git -C ${folder} pull`;
    await exec(command);
}

async function inspectRepo(user: string, repo: string, config: Config) {
    const repoPath = getRepoPath(user, repo, config);
    return {
        exists: await pathExists(repoPath),
        isGitRepo: await pathExists(path.resolve(repoPath, '.git')),
    };
}

async function syncronizeRepo(user: string, repo: string, config: Config) {
    const repoPath = path.resolve(config.data, 'users', user, repo);
    const repoFolder = await inspectRepo(user, repo, config);
    if (repoFolder.exists) {
        if (repoFolder.isGitRepo) {
            await updateRepo(user, repo, config);
        } else {
            await fs.rm(repoPath, { recursive: true, force: true });
            await cloneRepo(user, repo, config);
        }
    } else {
        await cloneRepo(user, repo, config);
    }
}

async function runCommand(command: string, user: string, repo: string, config: Config) {
    return new Promise<void>((resolve, reject) => {
        const folder = getProjectFolder(user, repo, config);
        const child = child_process.spawn(command.split(' ')[0], command.split(' ').slice(1), {
            cwd: folder,
            stdio: 'inherit'
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code != 0) {
                reject(new Error(`Running ${command}\nExit code ${code}`));
            } else {
                resolve();
            }
        });
    });
}

async function runParallelCommands(commands: string[], user: string, repo: string, config: Config) {
    for (const command of commands) {
        console.log(`Running ${command}`.yellow);
    }
    return new Promise<void>((resolve, reject) => {
        let closed = 0;
        const folder = getProjectFolder(user, repo, config);
        const children = commands.map((command, index, commands) =>
            child_process.spawn(command.split(' ')[0], command.split(' ').slice(1), {
                cwd: folder,
                stdio: index === commands.length - 1
                    ? 'inherit'
                    : 'ignore'
            })
        );
        const error = (failure: child_process.ChildProcess) => {
            for (const child of children) {
                if (child != failure) {
                    child.kill();
                }
            }
            reject();
        };
        const close = () => {
            closed++;
            if (closed === children.length) {
                resolve();
            }
        };
        for (const child of children) {
            child.on('close', close);
            child.on('error', () => error(child));
        }
    });
}

interface GlobalOptions {
    user: string;
    repo: string;
    npm: boolean;
    data?: string;
}

interface StartOptions {
    vue?: boolean;
    laravel?: boolean;
    run?: string;
    scope?: string;
}

(async() => {
    try {
        const program = new Command();
        program.requiredOption('-r, --repo <repo>');
        program.requiredOption('-u, --user <github_id>');
        program.option('-d, --data <path>');
        program.command('start')
            .description('clone one user\'s repo and starts it')
            .option('--laravel')
            .option('--vue')
            .option('-r, --run <commands>')
            .option('-s, --scope <path>')
            .action(async ({
                vue = false,
                laravel = false,
                run: userCommands,
                scope,
            }: StartOptions) => {
                try {
                    const {
                        user,
                        repo: name,
                        data = path.resolve(__dirname, '..', 'data'),
                    } = program.opts() as GlobalOptions;
                    const config: Config = {
                        data,
                        projectScope: scope,
                    };
                    await syncronizeRepo(user, name, config);
                    const repo = path.resolve(getRepoPath(user, name, config));
                    const commands = userCommands
                        ? userCommands
                            .split('&&')
                            .map((command) => command.trim())
                        : [];
                    if (laravel) {
                        const project = getProjectFolder(user, repo, config);
                        const dotenvExample = path.resolve(project, '.env.example');
                        const dotenv = path.resolve(project, '.env');
                        if (await pathExists(dotenvExample)) {
                            await fs.copyFile(dotenvExample, dotenv);
                        }
                        await runCommand('composer install', user, name, config);
                        await runCommand('npm install', user, name, config);
                        if (await pathExists(dotenv)) {
                            const contents = envfile.parse(await fs.readFile(dotenv, 'utf-8'));
                            if (contents['APP_DEBUG'] !== 'true') {
                                contents['APP_DEBUG'] = 'true';
                                await fs.writeFile(dotenv, envfile.stringify(contents));
                            }
                            if (contents['APP_KEY'] == null || contents['APP_KEY'] === '') {
                                await runCommand('php artisan key:generate', user, name, config);
                            }
                        }
                        for (const command of commands) {
                            await runCommand(command, user, name, config);
                        }
                        await runParallelCommands([
                            'npm run watch',
                            'php artisan serve'
                        ], user, name, config);
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