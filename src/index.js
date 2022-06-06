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
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const cuid_1 = __importDefault(require("cuid"));
const app = new koa_1.default();
const router = new router_1.default({ prefix: "/api" });
const jwtSecret = "secret";
const config = {
    PORT: 10406,
};
let lobbies = {};
const names = [
    "Roddy ST.James",
    "Rita Malone",
    "Whitey",
    "Sid",
    "Toad",
    "Le Frog",
];
const sleep = (duration) => __awaiter(void 0, void 0, void 0, function* () { return yield new Promise((resolve) => setTimeout(resolve, duration)); });
exports.sleep = sleep;
class Player {
    constructor(name, ws, lobby, id) {
        this.cards = [];
        this.connected = true;
        this.name = name || getRandomName(lobby.id);
        this.ws = ws;
        this.readyState = false;
        this.id = id;
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
        else if (type === 3) {
            if (data) {
                this.name = data;
            }
            else {
                this.name = getRandomName(this.lobby.id);
            }
        }
        this.lobby.alertPlayersList();
    }
    socketClose() {
        this.connected = false;
        this.lobby.dealtCards.map((card) => {
            if (!(card in this.cards)) {
                return card;
            }
        });
        if (this.lobby.players.length === 0) {
            delete lobbies[this.lobby.id];
        }
        this.lobby.alertPlayersList();
    }
}
class Lobby {
    constructor(id, players) {
        this.players = [];
        this.isPlaying = false;
        this.playedCards = [];
        this.dealtCards = [];
        this.lives = 0;
        this.id = id;
        this.players = players || [];
    }
    addPlayer(player, index) {
        if (!player.ws)
            return;
        if (index !== -1 && index !== undefined) {
            this.players[index] = player;
        }
        else {
            this.players.push(player);
        }
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
            this.broadcast(2, true);
            let round = 1;
            this.lives = this.players.length;
            this.broadcast(5, this.lives);
            while (round < 12 - this.players.length && this.lives > 0) {
                this.playedCards = [];
                this.dealtCards = [];
                this.initCards(round);
                let hasPlayedAllCards = false;
                let correctCard = true;
                while (!hasPlayedAllCards && correctCard) {
                    this.broadcast(4, this.playedCards);
                    yield this.waitForCard();
                    const length = this.playedCards.length;
                    correctCard =
                        this.playedCards[length - 1] === this.dealtCards[length - 1];
                    hasPlayedAllCards = this.players.every((player) => player.cards.length === 0);
                }
                if (!correctCard) {
                    this.lives -= 1;
                    this.broadcast(5, this.lives);
                }
                else {
                    round += 1;
                }
                console.log(correctCard, round);
            }
            if (!this.lives) {
                this.broadcast(6, true);
                lobbies[this.id] = new Lobby(this.id, this.players);
                this.players = this.players.map((player) => {
                    player.readyState = false;
                    return player;
                });
                this.alertPlayersList();
            }
            else {
                this.broadcast(7, undefined);
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
        this.players.forEach((player) => {
            if (player.connected) {
                player.ws.send(JSON.stringify({
                    type: 1,
                    data: this.players.map((_player) => {
                        return {
                            name: _player.name,
                            readyState: _player.readyState,
                            cards: _player.cards,
                            local: _player.ws === player.ws,
                            id: _player.id,
                        };
                    }),
                }));
            }
        });
    }
    broadcast(type, data, ws) {
        this.players.forEach((player) => {
            if (player.connected) {
                player.ws.send(JSON.stringify({
                    type,
                    data,
                }));
            }
        });
    }
    initCards(roundIndex) {
        console.log("initiating round:" + roundIndex);
        let numbers = [...Array(100).keys()];
        numbers = numbers.sort(() => 0.5 - Math.random());
        this.dealtCards = [];
        this.playedCards = [];
        const cards = {};
        //byt ut mot broadcast function
        this.players.forEach((player) => {
            if (player.connected) {
                const _cards = numbers.splice(0, roundIndex);
                player.cards = _cards;
                this.dealtCards.push(..._cards);
                cards[player.id] = _cards;
            }
        });
        this.broadcast(3, cards);
        this.dealtCards = this.dealtCards.sort(function (a, b) {
            return a > b ? 1 : -1;
        });
    }
}
const getRandomName = (id) => {
    const _names = names.filter((name) => !lobbies[id].players.map((player) => player.name).includes(name));
    const name = _names[Math.floor(Math.random() * _names.length)];
    return name;
};
router.get("/", (ctx) => {
    ctx.body = "mindgame";
});
router.get("/lobbies", (ctx) => {
    let _lobbies = [];
    for (const lobby in lobbies) {
        _lobbies.push({
            id: lobby,
            players: lobbies[lobby].players.map((player) => player.name),
        });
    }
    ctx.body = _lobbies;
});
router.post("/token", (ctx) => {
    const { name, bodyToken } = ctx.request.body;
    let _token;
    if (bodyToken) {
        _token = jsonwebtoken_1.default.verify(bodyToken, jwtSecret);
    }
    const sub = _token ? _token.sub : (0, cuid_1.default)();
    console.log(sub, bodyToken);
    const token = jsonwebtoken_1.default.sign({ name, sub }, jwtSecret);
    ctx.body = JSON.stringify({ token });
});
router.get("/lobby/:id/", (ctx) => __awaiter(void 0, void 0, void 0, function* () {
    //connect to lobby
    const id = ctx.params.id;
    const queryToken = ctx.request.query["token"];
    const token = jsonwebtoken_1.default.verify(queryToken, jwtSecret);
    console.log(token);
    if (!ctx.ws || !id || !token)
        return;
    const ws = yield ctx.ws();
    if (!lobbies[id]) {
        console.log(`Creating lobby with id: ${id}`);
        lobbies[id] = new Lobby(id);
    }
    const ids = lobbies[id].players.map((player) => player.id);
    let index = ids.indexOf(token.sub);
    if (!lobbies[id].isPlaying && !(lobbies[id].players.length >= 4)) {
        if (index === -1) {
            const player = new Player(token.name, ws, lobbies[id], token.sub);
            lobbies[id].addPlayer(player, index);
        }
        ctx.body = "Lobby is playing";
    }
    else if (index !== -1) {
        lobbies[id].players[index].ws = ws;
        lobbies[id].players[index].connected = true;
        ctx.body = "Connected";
    }
}));
app.use((0, koa_body_1.default)());
app.use((0, koa_easy_ws_1.default)());
app.use((0, cors_1.default)());
app.use(router.routes());
app.listen(config.PORT);
console.log(`Started server on port ${config.PORT}`);
