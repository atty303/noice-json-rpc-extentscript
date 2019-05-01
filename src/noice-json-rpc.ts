import {JsonRpc2} from './json-rpc2'
import {EventEmitter} from 'eventemitter3'
export {JsonRpc2}

export interface LikeSocket {
    send(message: string): void
    on(event: string, cb: Function): any
    removeListener(event: string, cb: Function): any
}

export interface LikeSocketServer {
    on(event: string, cb: Function): any
    clients?: LikeSocket[]
}

export interface LogOpts {
    /** All messages will be emmitted and can be handled by client.on('receive', (msg: string) => void) and client.on('send', (msg: string) => any)  */
    logEmit?: boolean

    /** All messages will be logged to console */
    logConsole?: boolean
}

export interface ClientOpts extends LogOpts {
}

export interface ServerOpts extends LogOpts {
}

export class MessageError extends Error implements JsonRpc2.Error {
    public readonly code: JsonRpc2.ErrorCode;
    public readonly data?: any;

    constructor(error: JsonRpc2.Error) {
        super(error.message);
        this.code = error.code || 0;
        this.data = error.data || null;
    }
}

/**
 * Creates a RPC Server.
 * It is intentional that Server does not create a WebSocketServer object since we prefer composability
 * The Server can be used to communicate over processes, http or anything that can send and receive strings
 * It just needs to pass in an object that implements LikeSocketServer interface
 */
export class Server extends EventEmitter implements JsonRpc2.Server {
    private _socketServer: LikeSocketServer
    private _exposedMethodsMap: {[key: string]: (params: any) => JsonRpc2.PromiseOrNot<any>} = {}
    private _emitLog: boolean = false
    private _consoleLog: boolean = false

    constructor (server: LikeSocketServer, opts?: ServerOpts) {
        super()
        this.setLogging(opts)

        if (!server) {
            throw new TypeError('server cannot be undefined or null')
        }

        this._socketServer = server
        server.on('connection', (socket: LikeSocket) => {
            socket.on('message', (message: string) => this.processMessage(message, socket))
        })
    }

    private processMessage(messageStr: string, socket: LikeSocket): void {
        this._logMessage(messageStr, 'receive')
        let request: JsonRpc2.Request

        // Ensure JSON is not malformed
        try {
            request = JSON.parse(messageStr)
        } catch (e) {
            return this._sendError(socket, request, JsonRpc2.ErrorCode.ParseError)
        }


        // Ensure method is atleast defined
        if (request && request.method && typeof request.method === 'string') {
            if (request.id && typeof request.id === 'number') {
                const handler = this._exposedMethodsMap[request.method]
                // Handler is defined so lets call it
                if (handler) {
                    try {
                        const result: JsonRpc2.PromiseOrNot<any> = handler.call(null, request.params)
                        // if (result instanceof Promise) {
                        //     // Result is a promise, so lets wait for the result and handle accordingly
                        //     result.then((actualResult: any) => {
                        //         this._send(socket, {id: request.id, result: actualResult || {}})
                        //     }).catch((error: Error) => {
                        //         this._sendError(socket, request, JsonRpc2.ErrorCode.InternalError, error)
                        //     })
                        // } else {
                            // Result is not a promise so send immediately
                            this._send(socket, {id: request.id, result: result || {}})
                        // }
                    } catch (error) {
                        this._sendError(socket, request, JsonRpc2.ErrorCode.InternalError, error)
                    }
                } else {
                    this._sendError(socket, request, JsonRpc2.ErrorCode.MethodNotFound)
                }
            } else {
                // Message is a notification, so just emit
                this.emit(request.method, request.params)
            }
        } else {
            // No method property, send InvalidRequest error
            this._sendError(socket, request, JsonRpc2.ErrorCode.InvalidRequest)
        }
    }

    /** Set logging for all received and sent messages */
    public setLogging({logEmit, logConsole}: LogOpts = {}) {
        this._emitLog = logEmit
        this._consoleLog = logConsole
    }

    private _logMessage(messageStr: string, direction: 'send' | 'receive') {
        if (this._consoleLog) {
            console.log(`Server ${direction === 'send' ? '>' : '<'}`, messageStr)
        }

        if (this._emitLog) {
            this.emit(direction, messageStr)
        }
    }

    private _send(socket: LikeSocket, message: JsonRpc2.Response | JsonRpc2.Notification ) {
        const messageStr = JSON.stringify(message)
        this._logMessage(messageStr, 'send')
        socket.send(messageStr)
    }

    private _sendError(socket: LikeSocket, request: JsonRpc2.Request, errorCode: JsonRpc2.ErrorCode, error?: Error) {
        try {
            this._send(socket, {
                id: request && request.id || -1,
                error: this._errorFromCode(errorCode, error && error.message || error, request && request.method)
            })
        } catch (error) {
            // Since we can't even send errors, do nothing. The connection was probably closed.
        }
    }

    private _errorFromCode(code: JsonRpc2.ErrorCode, data?: any, method?: string): JsonRpc2.Error {
        let message = ''

        switch (code) {
            case JsonRpc2.ErrorCode.InternalError:
                message =  `InternalError: Internal Error when calling '${method}'`
                break
            case JsonRpc2.ErrorCode.MethodNotFound:
                message =  `MethodNotFound: '${method}' wasn't found`
                break
            case JsonRpc2.ErrorCode.InvalidRequest:
                message =  'InvalidRequest: JSON sent is not a valid request object'
                break
            case JsonRpc2.ErrorCode.ParseError:
                message =  'ParseError: invalid JSON received'
                break
        }

        return {code, message, data}
    }

    expose(method: string, handler: (params: any) => Promise<any>): void {
        this._exposedMethodsMap[method] = handler
    }

    notify (method: string, params?: any): void {
        // Broadcast message to all clients
        if (this._socketServer.clients) {
            for (let i = 0; i < this._socketServer.clients.length; ++i) {
                this._send(this._socketServer.clients[i], {method, params})
            }
        } else {
            throw new Error('SocketServer does not support broadcasting. No "clients: LikeSocket[]" property found')
        }
    }
}
