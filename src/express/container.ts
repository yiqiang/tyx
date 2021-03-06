
import { Express, Request, Response } from "express";
import { Server, createServer } from "http";
import { ContainerPool } from "../core/container";
import { InternalServerError } from "../core/errors";
import { LogLevel } from "../core/logger";
import { HttpMethod, HttpRequest } from "../core/types";
import { HttpUtils, Utils } from "../core/utils";

import express = require("express");
import BodyParser = require("body-parser");

export {
    Express
};

export class ExpressContainer extends ContainerPool {

    private server: Server;
    private app: Express;
    private basePath: string;

    constructor(application: string, basePath?: string) {
        super(application, ExpressContainer.name);
        this.basePath = basePath;
    }

    public start(port?: number): Server {
        port = port || 5000;

        this.prepare();

        this.app = express();
        this.app.use(BodyParser.text({ type: ["*/json", "text/*"], defaultCharset: "utf-8" }));
        this.app.use((req, res, next) => {
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,PATCH");
            res.header("Access-Control-Allow-Headers", "Origin, Content-Type, Content-Encoding, Accept, Authorization");
            res.header("Access-Control-Expose-Headers", "Token");
            res.header("Connection", "close");
            next();
        });

        let used = {};
        let paths = [];

        let httpMetadata = this.metadata.httpMetadata;
        for (let hd in httpMetadata) {
            let target = httpMetadata[hd];
            let httpMethod = target.verb;
            let resource = target.resource;

            let parts = resource.split("{");
            parts = parts.map(p => p.replace("}", ""));
            let path = parts.join(":");

            this.log.info("Add route: %s >> %s", hd, path);

            let route = `${httpMethod} ${path}`;
            if (used[route]) continue;
            used[route] = true;
            if (this.basePath) path = this.basePath + path;
            paths.push(`${httpMethod} - http://localhost:${port}${path}`);

            this.log.info("Registered route: %s", route);

            let adapter = (req: Request, res: Response) => {
                this.handle(resource, req, res);
            };

            switch (httpMethod) {
                case "GET":
                    this.app.get(path, adapter);
                    break;
                case "POST":
                    this.app.post(path, adapter);
                    break;
                case "PUT":
                    this.app.put(path, adapter);
                    break;
                case "PATCH":
                    this.app.patch(path, adapter);
                    break;
                case "DELETE":
                    this.app.delete(path, adapter);
                    break;
                default: throw new InternalServerError(`Unsupported http method: ${httpMethod}`);
            }
        }

        this.server = createServer(this.app);
        this.server.listen(port);

        this.log.info("Server initialized.");
        paths.forEach(x => this.log.info(x));
        this.log.info("Server started at %s ...", port);

        return this.server;
    }

    private async handle(resource: string, req: Request, res: Response) {
        LogLevel.set(this.config.logLevel);
        this.log.info("%s: %s", req.method, req.url);

        if (Buffer.isBuffer(req.body))
            req.body = req.body.toString("utf-8");

        if (req.body instanceof Object) {
            if (Object.getOwnPropertyNames(req.body).length)
                req.body = JSON.stringify(req.body);
            else
                req.body = undefined;
        }

        let request: HttpRequest = {
            type: "http",
            requestId: Utils.uuid(),
            sourceIp: req.ip || "255.255.255.255",

            application: undefined,
            service: undefined,
            method: undefined,

            httpMethod: req.method as HttpMethod,
            resource,
            path: req.path,
            pathParameters: req.params || {},
            queryStringParameters: req.query || {},
            headers: req.headers as Record<string, string> || {},
            body: req.body,
            isBase64Encoded: false // TODO
        };

        try {
            let result = await super.httpRequest(request);
            for (let header in result.headers) {
                res.setHeader(header, result.headers[header]);
            }
            if (result.contentType) res.setHeader("Content-Type", result.contentType);
            res.status(result.statusCode).send(result.body);
        } catch (err) {
            let result = HttpUtils.error(err);
            for (let header in result.headers) {
                res.setHeader(header, result.headers[header]);
            }
            res.status(result.statusCode).send(result.body);
        }
    }

    public stop() {
        super.dispose();
        this.server.close();
    }
}