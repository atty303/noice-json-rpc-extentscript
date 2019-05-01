import { JsonRpc2 } from './json-rpc2';
import { EventEmitter } from 'eventemitter3';
export { JsonRpc2 };
export interface LikeSocket {
    send(message: string): void;
    on(event: string, cb: Function): any;
    removeListener(event: string, cb: Function): any;
}
export interface LikeSocketServer {
    on(event: string, cb: Function): any;
    clients?: LikeSocket[];
}
export interface LogOpts {
    /** All messages will be emmitted and can be handled by client.on('receive', (msg: string) => void) and client.on('send', (msg: string) => any)  */
    logEmit?: boolean;
    /** All messages will be logged to console */
    logConsole?: boolean;
}
export interface ClientOpts extends LogOpts {
}
export interface ServerOpts extends LogOpts {
}
export declare class MessageError extends Error implements JsonRpc2.Error {
    readonly code: JsonRpc2.ErrorCode;
    readonly data?: any;
    constructor(error: JsonRpc2.Error);
}
/**
 * Creates a RPC Server.
 * It is intentional that Server does not create a WebSocketServer object since we prefer composability
 * The Server can be used to communicate over processes, http or anything that can send and receive strings
 * It just needs to pass in an object that implements LikeSocketServer interface
 */
export declare class Server extends EventEmitter implements JsonRpc2.Server {
    private _socketServer;
    private _exposedMethodsMap;
    private _emitLog;
    private _consoleLog;
    constructor(server: LikeSocketServer, opts?: ServerOpts);
    private processMessage(messageStr, socket);
    /** Set logging for all received and sent messages */
    setLogging({logEmit, logConsole}?: LogOpts): void;
    private _logMessage(messageStr, direction);
    private _send(socket, message);
    private _sendError(socket, request, errorCode, error?);
    private _errorFromCode(code, data?, method?);
    expose(method: string, handler: (params: any) => Promise<any>): void;
    notify(method: string, params?: any): void;
}
