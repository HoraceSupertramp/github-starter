# github-starter

A small set of everyday life utilities to interact with certain types of Github hosted public projects

# install

npm install -g https://github.com/HoraceSupertramp/github-starter.git

# usage

```repo-utils [github_options] [command]```

where

## [github_options]

> ```-h, --help``` Display usage<br>
```-u, --user``` Github username<br>
```-r, --repo``` Repo name (must be a public<br>repo)

## [command]

### ```start [command_options]```

>Runs some commands in some user's repo. Commands can be specified manually (through the --run flag) or as a preset (--vue and --laravel flags).
>
>#### [command_options]
>
>>```--run``` Runs some commands after the repo has been cloned. Multiple commands must be specified with ```&&```<br>
>>```--laravel``` Runs, in sequence:<br>
>> - ```composer install```
>> - ```php artisan key:generate``` (if needed)
>> - ```php artisan serve```

# examples

Clones this same repo and tries to run it as a laravel project (don't do this, it does not work).

```repo-utils -u HoraceSupertramp -r repo-utils start --laravel```

