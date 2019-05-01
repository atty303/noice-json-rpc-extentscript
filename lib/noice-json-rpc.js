"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
exports.__esModule = true;
var eventemitter3_1 = require("eventemitter3");
var MessageError = /** @class */ (function (_super) {
    __extends(MessageError, _super);
    function MessageError(error) {
        var _this = _super.call(this, error.message) || this;
        _this.code = error.code || 0;
        _this.data = error.data || null;
        return _this;
    }
    return MessageError;
}(Error));
exports.MessageError = MessageError;
/**
 * Creates a RPC Server.
 * It is intentional that Server does not create a WebSocketServer object since we prefer composability
 * The Server can be used to communicate over processes, http or anything that can send and receive strings
 * It just needs to pass in an object that implements LikeSocketServer interface
 */
var Server = /** @class */ (function (_super) {
    __extends(Server, _super);
    function Server(server, opts) {
        var _this = _super.call(this) || this;
        _this._exposedMethodsMap = {};
        _this._emitLog = false;
        _this._consoleLog = false;
        _this.setLogging(opts);
        if (!server) {
            throw new TypeError('server cannot be undefined or null');
        }
        _this._socketServer = server;
        server.on('connection', function (socket) {
            socket.on('message', function (message) { return _this.processMessage(message, socket); });
        });
        return _this;
    }
    Server.prototype.processMessage = function (messageStr, socket) {
        this._logMessage(messageStr, 'receive');
        var request;
        // Ensure JSON is not malformed
        try {
            request = JSON.parse(messageStr);
        }
        catch (e) {
            return this._sendError(socket, request, -32700 /* ParseError */);
        }
        // Ensure method is atleast defined
        if (request && request.method && typeof request.method === 'string') {
            if (request.id && typeof request.id === 'number') {
                var handler = this._exposedMethodsMap[request.method];
                // Handler is defined so lets call it
                if (handler) {
                    try {
                        var result = handler.call(null, request.params);
                        // if (result instanceof Promise) {
                        //     // Result is a promise, so lets wait for the result and handle accordingly
                        //     result.then((actualResult: any) => {
                        //         this._send(socket, {id: request.id, result: actualResult || {}})
                        //     }).catch((error: Error) => {
                        //         this._sendError(socket, request, JsonRpc2.ErrorCode.InternalError, error)
                        //     })
                        // } else {
                        // Result is not a promise so send immediately
                        this._send(socket, { id: request.id, result: result || {} });
                        // }
                    }
                    catch (error) {
                        this._sendError(socket, request, -32603 /* InternalError */, error);
                    }
                }
                else {
                    this._sendError(socket, request, -32601 /* MethodNotFound */);
                }
            }
            else {
                // Message is a notification, so just emit
                this.emit(request.method, request.params);
            }
        }
        else {
            // No method property, send InvalidRequest error
            this._sendError(socket, request, -32600 /* InvalidRequest */);
        }
    };
    /** Set logging for all received and sent messages */
    Server.prototype.setLogging = function (_a) {
        var _b = _a === void 0 ? {} : _a, logEmit = _b.logEmit, logConsole = _b.logConsole;
        this._emitLog = logEmit;
        this._consoleLog = logConsole;
    };
    Server.prototype._logMessage = function (messageStr, direction) {
        if (this._consoleLog) {
            console.log("Server " + (direction === 'send' ? '>' : '<'), messageStr);
        }
        if (this._emitLog) {
            this.emit(direction, messageStr);
        }
    };
    Server.prototype._send = function (socket, message) {
        var messageStr = JSON.stringify(message);
        this._logMessage(messageStr, 'send');
        socket.send(messageStr);
    };
    Server.prototype._sendError = function (socket, request, errorCode, error) {
        try {
            this._send(socket, {
                id: request && request.id || -1,
                error: this._errorFromCode(errorCode, error && error.message || error, request && request.method)
            });
        }
        catch (error) {
            // Since we can't even send errors, do nothing. The connection was probably closed.
        }
    };
    Server.prototype._errorFromCode = function (code, data, method) {
        var message = '';
        switch (code) {
            case -32603 /* InternalError */:
                message = "InternalError: Internal Error when calling '" + method + "'";
                break;
            case -32601 /* MethodNotFound */:
                message = "MethodNotFound: '" + method + "' wasn't found";
                break;
            case -32600 /* InvalidRequest */:
                message = 'InvalidRequest: JSON sent is not a valid request object';
                break;
            case -32700 /* ParseError */:
                message = 'ParseError: invalid JSON received';
                break;
        }
        return { code: code, message: message, data: data };
    };
    Server.prototype.expose = function (method, handler) {
        this._exposedMethodsMap[method] = handler;
    };
    Server.prototype.notify = function (method, params) {
        // Broadcast message to all clients
        if (this._socketServer.clients) {
            for (var i = 0; i < this._socketServer.clients.length; ++i) {
                this._send(this._socketServer.clients[i], { method: method, params: params });
            }
        }
        else {
            throw new Error('SocketServer does not support broadcasting. No "clients: LikeSocket[]" property found');
        }
    };
    return Server;
}(eventemitter3_1.EventEmitter));
exports.Server = Server;
