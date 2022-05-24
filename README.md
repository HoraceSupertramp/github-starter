# github-starter

A small set of everyday life utilities to automatize the interactions with certain types of Github hosted public projects.

# install

- ```git clone https://github.com/HoraceSupertramp/github-starter.git```
 - ```npm link```

# usage

```github-starter [options] [command]```

where

## [options]

```-h, --help``` Display usage.<br>
```-u, --user``` Github username.<br>
```-r, --repo``` Repo name (must be a public<br>repo).

## [command]

### ```start [options]```

>Runs some commands in some user's repo. Commands can be specified manually (through the --run flag) or as a preset (--vue and --laravel flags).
>
>#### [options]
>
>```--scope <path>``` The subpath inside the repo where the actual project is located.<br>
> *The following options are mutually exclusive.*<br>
>```--run``` Runs some custom commands after the repo has been cloned. Multiple commands must be specified with ```&&```.<br>
>```--laravel``` Executes a preset of commands to start a Laravel project inside the cloned repo:<br>
> - runs ```composer install```.
> - runs ```npm install```.
> - renames ```.env.example``` to ```.env``` if the former exists.
> - ensures ```APP_DEBUG=true``` in ```.env``` if the latter exists.
> - runs ```php artisan generate:key``` if ```.env``` exists and ```APP_KEY``` is not defined in it.
> - runs ```php artisan serve``` and ```npm run watch``` in parallel.

# examples

Clones this same repo and tries to run it as a laravel project (don't do this, it does not work).

```github-starter -u HoraceSupertramp -r github-starter start --laravel```

