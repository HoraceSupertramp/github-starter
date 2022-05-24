#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = __importDefault(require("util"));
const promises_1 = __importDefault(require("fs/promises"));
const child_process_1 = __importDefault(require("child_process"));
const path_1 = __importDefault(require("path"));
const envfile = __importStar(require("envfile"));
const commander_1 = require("commander");
require("colors");
const exec = util_1.default.promisify(child_process_1.default.exec);
function pathExists(path) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield promises_1.default.access(path);
            return true;
        }
        catch (error) {
            return false;
        }
    });
}
function getUsersPath(user, config) {
    return path_1.default.resolve(config.data, 'users', user);
}
function getReposPath(user, config) {
    return path_1.default.resolve(getUsersPath(user, config), 'repos');
}
function getRepoPath(user, name, config) {
    return path_1.default.resolve(getReposPath(user, config), name);
}
function cloneRepo(user, repo, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const folder = getReposPath(user, config);
        console.log(`Cloning ${repo} ${user}`.green);
        yield promises_1.default.mkdir(folder, { recursive: true });
        const command = `git -C ${folder} clone https://github.com/${user}/${repo}.git`;
        yield exec(command);
    });
}
function updateRepo(user, repo, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const folder = getRepoPath(user, repo, config);
        console.log(`Pulling ${repo} ${user}`.green);
        const command = `git -C ${folder} pull`;
        yield exec(command);
    });
}
function inspectRepo(user, repo, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const repoPath = getRepoPath(user, repo, config);
        return {
            exists: yield pathExists(repoPath),
            isGitRepo: yield pathExists(path_1.default.resolve(repoPath, '.git')),
        };
    });
}
function syncronizeRepo(user, repo, config) {
    return __awaiter(this, void 0, void 0, function* () {
        const repoPath = path_1.default.resolve(config.data, 'users', user, repo);
        const repoFolder = yield inspectRepo(user, repo, config);
        if (repoFolder.exists) {
            if (repoFolder.isGitRepo) {
                yield updateRepo(user, repo, config);
            }
            else {
                yield promises_1.default.rm(repoPath, { recursive: true, force: true });
                yield cloneRepo(user, repo, config);
            }
        }
        else {
            yield cloneRepo(user, repo, config);
        }
    });
}
function runCommand(command, folder) {
    return __awaiter(this, void 0, void 0, function* () {
        return new Promise((resolve, reject) => {
            const child = child_process_1.default.spawn(command.split(' ')[0], command.split(' ').slice(1), {
                cwd: folder,
                stdio: 'inherit'
            });
            child.on('error', reject);
            child.on('close', (code) => {
                if (code != 0) {
                    reject(new Error(`Running ${command}\nExit code ${code}`));
                }
                else {
                    resolve();
                }
            });
        });
    });
}
function runParallelCommands(commands, folder) {
    return __awaiter(this, void 0, void 0, function* () {
        for (const command of commands) {
            console.log(`Running ${command}`.yellow);
        }
        return new Promise((resolve, reject) => {
            let closed = 0;
            const children = commands.map((command, index, commands) => child_process_1.default.spawn(command.split(' ')[0], command.split(' ').slice(1), {
                cwd: folder,
                stdio: index === commands.length - 1
                    ? 'inherit'
                    : 'ignore'
            }));
            const error = (failure) => {
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
    });
}
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const program = new commander_1.Command();
        program.requiredOption('-r, --repo <repo>');
        program.requiredOption('-u, --user <github_id>');
        program.option('-d, --data <path>');
        program.command('start')
            .description('clone one user\'s repo and starts it')
            .option('--laravel')
            .option('--vue')
            .option('-r, --run <commands>')
            .action(({ vue = false, laravel = false, run: userCommands }) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { user, repo: name, data = path_1.default.resolve(__dirname, '..', 'data'), } = program.opts();
                const config = { data };
                const repo = getRepoPath(user, name, config);
                yield syncronizeRepo(user, name, config);
                const commands = userCommands
                    ? userCommands
                        .split('&&')
                        .map((command) => command.trim())
                    : [];
                if (laravel) {
                    const dotenvExample = path_1.default.resolve(repo, '.env.example');
                    const dotenv = path_1.default.resolve(repo, '.env');
                    if (yield pathExists(dotenvExample)) {
                        yield promises_1.default.copyFile(dotenvExample, dotenv);
                    }
                    yield runCommand('composer install', repo);
                    yield runCommand('npm install', repo);
                    if (yield pathExists(dotenv)) {
                        const contents = envfile.parse(yield promises_1.default.readFile(dotenv, 'utf-8'));
                        if (contents['APP_KEY'] == null || contents['APP_KEY'] === '') {
                            yield runCommand('php artisan key:generate', repo);
                        }
                    }
                    for (const command of commands) {
                        yield runCommand(command, repo);
                    }
                    yield runParallelCommands([
                        'npm run watch',
                        'php artisan serve'
                    ], repo);
                }
            }
            catch (error) {
                console.error('An error occurred', error);
                process.exit(1);
            }
        }));
        program.showHelpAfterError();
        yield program.parseAsync(process.argv);
    }
    catch (error) {
        console.error(error);
        process.exit(1);
    }
}))();
//# sourceMappingURL=index.js.map