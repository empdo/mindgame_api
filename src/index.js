"use strict";
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
exports.sleep = void 0;
const koa_1 = __importDefault(require("koa"));
const koa_body_1 = __importDefault(require("koa-body"));
const koa_easy_ws_1 = __importDefault(require("koa-easy-ws"));
const router_1 = __importDefault(require("@koa/router"));
const cors_1 = __importDefault(require("@koa/cors"));
const uuid_1 = require("uuid");
const app = new koa_1.default();
const router = new router_1.default();
const config = {
    PORT: 5000,
};
let lobbies = {};
const sleep = (duration) => __awaiter(void 0, void 0, void 0, function* () { return yield new Promise((resolve) => setTimeout(resolve, duration)); });
exports.sleep = sleep;
class Player {
    constructor(name, ws, lobby) {
        this.cards = [];
        this.name = name;
        this.ws = ws;
        this.readyState = false;
        this.id = (0, uuid_1.v4)();
        this.lobby = lobby;
        this.ws.on("message", this.handleMessage.bind(this));
        this.ws.onclose = () => this.socketClose();
    }
    handleMessage(e) {
        if (!e)
            return;
        const { type, data } = JSON.parse(e);
        if (type === 1) {
            this.readyState = !this.readyState;
            if (this.lobby.players.every((player) => player.readyState === true)) {
                this.lobby.initGame();
            }
        }
        else if (type === 2) {
            this.lobby.playedCards.push(data);
            this.cards = this.cards.filter((card) => card !== data);
        }
        this.lobby.alertPlayersList();
    }
    socketClose() {
        this.lobby.players = this.lobby.players.filter((p) => p.ws !== this.ws);
        if (this.lobby.players.length === 0) {
            this.lobby.isPlaying = false;
        }
        this.lobby.alertPlayersList();
    }
}
class Lobby {
    constructor(id) {
        this.players = [];
        this.isPlaying = false;
        this.playedCards = [];
        this.dealtCards = [];
        this.lifes = 0;
        this.id = id;
    }
    addPlayer(player) {
        if (!player.ws)
            return;
        this.players.push(player);
        this.alertPlayersList();
    }
    initGame() {
        return __awaiter(this, void 0, void 0, function* () {
            this.isPlaying = true;
            yield this.gameloop();
        });
    }
    gameloop() {
        return __awaiter(this, void 0, void 0, function* () {
            this.broadcast(2);
            let round = 1;
            this.lifes = this.players.length;
            this.broadcast(5, this.lifes);
            while (round < 8 && this.lifes > 0) {
                this.initCards(round);
                let correctCard = true;
                let hasPlayedAllCards = false;
                while (!hasPlayedAllCards && correctCard) {
                    this.broadcast(4, this.playedCards);
                    yield this.waitForCard();
                    const length = this.playedCards.length;
                    console.log(this.playedCards, this.dealtCards);
                    correctCard =
                        this.playedCards[length - 1] === this.dealtCards[length - 1];
                    hasPlayedAllCards = this.players.every((player) => player.cards.length === 0);
                }
                if (!correctCard) {
                    this.playedCards = [];
                    this.dealtCards = [];
                    this.lifes -= 1;
                    this.broadcast(5, this.lifes);
                }
                else {
                    round += 1;
                }
            }
            if (!this.lifes) {
                this.broadcast(6);
                this.gameloop();
            }
        });
    }
    waitForCard() {
        return __awaiter(this, void 0, void 0, function* () {
            const length = this.playedCards.length;
            while (length >= this.playedCards.length) {
                yield (0, exports.sleep)(10);
            }
        });
    }
    alertPlayersList() {
        this.broadcast(1, this.players.map((player) => {
            return {
                name: player.name,
                readyState: player.readyState,
            };
        }));
    }
    broadcast(type, data, ws) {
        this.players.forEach((player) => {
            player.ws.send(JSON.stringify({
                type,
                data,
            }));
        });
    }
    initCards(roundIndex) {
        console.log("initiating round...");
        let numbers = [...Array(100).keys()];
        numbers = numbers.sort(() => 0.5 - Math.random());
        this.dealtCards = [];
        //byt ut mot broadcast function
        this.players.forEach((player) => {
            const cards = numbers.splice(0, roundIndex);
            player.cards = cards;
            this.dealtCards.push(...cards);
            player.ws.send(JSON.stringify({ type: 3, data: player.cards }));
        });
        this.dealtCards = this.dealtCards.sort();
    }
}
router.get("/", (ctx) => {
    ctx.body = "mindgame";
});
router.get("/lobbies", (ctx) => {
    ctx.body = Object.keys(lobbies);
});
router.get("/lobby/:id/", (ctx) => __awaiter(void 0, void 0, void 0, function* () {
    //connect to lobby
    const id = ctx.params.id;
    if (!ctx.ws || !id)
        return;
    const ws = yield ctx.ws();
    if (!lobbies[id]) {
        console.log(`Creating lobby with id: ${id}`);
        lobbies[id] = new Lobby(id);
    }
    if (!lobbies[id].isPlaying && !(lobbies[id].players.length >= 4)) {
        lobbies[id].addPlayer(new Player(ctx.request.hostname, ws, lobbies[id]));
        ctx.body = "Lobby is playing";
    }
}));
app.use((0, koa_body_1.default)());
app.use((0, koa_easy_ws_1.default)());
app.use((0, cors_1.default)());
app.use(router.routes());
app.listen(5000);
console.log(`Started server on port ${config.PORT}`);
