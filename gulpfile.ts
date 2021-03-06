///<reference path="node_modules/@types/node/index.d.ts"/>

import { Gulpclass, MergedTask, SequenceTask, Task } from "gulpclass";
import gulp = require("gulp");
import del = require("del");
import replace = require("gulp-replace");
import shell = require("gulp-shell");
import ts = require("gulp-typescript");
import sourcemaps = require("gulp-sourcemaps");
import install = require("gulp-install");
import fs = require("fs");
import mergeStream = require("merge-stream");
import path = require("path");

@Gulpclass()
export class Gulpfile {

    @Task()
    public clean(cb: any) {
        return del(["./build/**"], cb);
    }

    @SequenceTask()
    public samples() {
        return ["package", "compileSamples", "installModules", "copyServerlessFiles", "copyPublicFiles"];
    }

    @Task()
    public compileSamples(): any {
        let folders = this.getFolders("./samples");

        let tasks = folders.map(function (sampleFolder) {
            let buildDestination = "./build/samples/" + sampleFolder + "/";

            const tsProject = ts.createProject("./samples/tsconfig.json", { typescript: require("typescript") });
            const tsResult = gulp.src(["./samples/" + sampleFolder + "/**/*.ts", "./node_modules/@types/**/*.ts"])
                .pipe(replace(`../../../src`, "tyx"))
                .pipe(replace(`../../src`, "tyx"))
                .pipe(sourcemaps.init())
                .pipe(tsProject());

            return mergeStream([
                tsResult.dts.pipe(gulp.dest(buildDestination)),
                tsResult.js
                    .pipe(sourcemaps.write(".", { sourceRoot: "", includeContent: true }))
                    .pipe(gulp.dest(buildDestination))
            ]);
        });
        return mergeStream(tasks);
    }

    @Task()
    public installModules(): any {
        let folders = this.getFolders("./build/samples");

        let tasks = folders.map(function (sampleFolder) {
            let packageJsonSourcePath = "./samples/" + sampleFolder + "/package.json";
            let installPath = "./build/samples/" + sampleFolder;
            return gulp.src([packageJsonSourcePath])
                .pipe(gulp.dest(installPath))
                .pipe(install({
                    npm: ""
                } as any))
                .pipe(install({
                    npm: " --save ../../package/"
                } as any));
        });

        return mergeStream(tasks);
    }

    @Task()
    public copyServerlessFiles(): any {
        let folders = this.getFolders("./samples");

        let tasks = folders.map(function (sampleFolder) {
            let serverlessYmlSourcePath = "./samples/" + sampleFolder + "/serverless.yml";
            let copyToPath = "./build/samples/" + sampleFolder;
            return gulp.src([serverlessYmlSourcePath])
                .pipe(gulp.dest(copyToPath));
        });

        return mergeStream(tasks);
    }

    @Task()
    public copyPublicFiles(): any {
        let folders = this.getFolders("./samples");

        let tasks = folders.map(function (sampleFolder) {
            let publicSourcePath = "./samples/" + sampleFolder + "/public/**/*";
            let copyToPath = "./build/samples/" + sampleFolder + "/public";
            return gulp.src([publicSourcePath])
                .pipe(gulp.dest(copyToPath));
        });

        return mergeStream(tasks);
    }

    private getFolders(dir: string): string[] {
        return fs.readdirSync(dir)
            .filter(function (file) {
                return fs.statSync(path.join(dir, file)).isDirectory();
            });
    }

    ///// ---------------------------------------------------------------------------------

    /**
     * Removes /// <reference from compiled sources.
     */
    @Task()
    public packageReplaceReferences() {
        return gulp.src("./build/package/**/*.d.ts")
            .pipe(replace(`/// <reference types="node" />`, ""))
            .pipe(replace(`/// <reference types="express" />`, ""))
            .pipe(gulp.dest("./build/package"));
    }

    /**
     * Change the "private" state of the packaged package.json file to public.
     */
    @Task()
    public packagePreparePackageFile() {
        return gulp.src("package.json")
            .pipe(replace("\"private\": true,", "\"private\": false,"))
            .pipe(gulp.dest("./build/package"));
    }

    /**
     * Copies README.md into the package.
     */
    @Task()
    public packageCopyReadme() {
        return gulp.src("./README.md")
            // .pipe(replace(/```typescript([\s\S]*?)```/g, "```javascript$1```"))
            .pipe(gulp.dest("./build/package"));
    }

    /**
     * Copies src into the package.
     */
    @Task()
    public packageSource() {
        return gulp.src("./src/**/*")
            // .pipe(replace(/```typescript([\s\S]*?)```/g, "```javascript$1```"))
            .pipe(gulp.dest("./build/package"));
    }


    /**
     * Compiles all sources to the package directory.
     */
    @MergedTask()
    public packageCompile() {
        const tsProject = ts.createProject("tsconfig.json", { typescript: require("typescript") });
        const tsResult = gulp.src(["./src/**/*.ts", "./node_modules/@types/**/*.ts"])
            .pipe(sourcemaps.init())
            .pipe(tsProject());

        return [
            tsResult.dts.pipe(gulp.dest("./build/package")),
            tsResult.js
                .pipe(sourcemaps.write(".", { sourceRoot: "", includeContent: true }))
                .pipe(gulp.dest("./build/package"))
        ];
    }

    /**
     * Compiles all sources to the package directory.
     */
    @MergedTask()
    public localCompile() {
        const tsProject = ts.createProject("tsconfig.json", { typescript: require("typescript") });
        const tsResult = gulp.src(["./src/**/*.ts", "./node_modules/@types/**/*.ts"])
            .pipe(sourcemaps.init())
            .pipe(tsProject());

        return [
            tsResult.dts.pipe(gulp.dest("./build/local")),
            tsResult.js
                .pipe(sourcemaps.write(".", { sourceRoot: "", includeContent: true }))
                .pipe(gulp.dest("./build/local"))
        ];
    }

    /**
     * Change the "private" state of the packaged package.json file to public.
     */
    @Task()
    public localPreparePackage() {
        return gulp.src("package.json")
            // .pipe(replace("\"private\": true,", "\"private\": false,"))
            .pipe(gulp.dest("./build/local"));
        // .pipe(install({
        //     npm: " --production"
        // } as any));
    }

    /**
     * Creates a package that can be published to npm.
     */
    @SequenceTask()
    public local() {
        return [
            "clean",
            "localCompile",
            "localPreparePackage"
        ];
    }

    /**
     * Creates a package that can be published to npm.
     */
    @SequenceTask()
    public package() {
        return [
            "clean",
            "packageCompile",
            [
                "packageReplaceReferences",
                "packagePreparePackageFile",
                "packageCopyReadme",
                "packageSource"
            ]
        ];
    }

    /**
     * Publishes a package to npm from ./build/package directory.
     */
    @Task()
    public packagePublish() {
        return gulp.src("package.json", { read: false })
            .pipe(shell([
                "cd ./build/package && npm publish"
            ]));
    }

    /**
     * Publishes a package to npm from ./build/package directory with @beta tag.
     */
    @Task()
    public packagePublishBeta() {
        return gulp.src("package.json", { read: false })
            .pipe(shell([
                "cd ./build/package && npm publish --tag beta"
            ]));
    }

    /**
     * Publishes a package to npm from ./build/package directory with @next tag.
     */
    @Task()
    public packagePublishNext() {
        return gulp.src("package.json", { read: false })
            .pipe(shell([
                "cd ./build/package && npm publish --tag next"
            ]));
    }

    /**
     * Creates a package and publishes it to npm.
     */
    @SequenceTask()
    public publish() {
        return ["package", "packagePublish"];
    }

    /**
     * Creates a package and publishes it to npm with @next tag.
     */
    @SequenceTask("publish-beta")
    public publishBeta() {
        return ["package", "packagePublishBeta"];
    }

    /**
     * Creates a package and publishes it to npm with @next tag.
     */
    @SequenceTask("publish-next")
    public publishNext() {
        return ["package", "packagePublishNext"];
    }
}