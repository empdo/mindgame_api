import Koa from "koa";
import koaBody from "koa-body";
import koaWs from "koa-easy-ws";
import KoaRouter from "@koa/router";
import koaCors from "@koa/cors";
import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";

const app = new Koa();
const router = new KoaRouter({ prefix: "/api" });

const config = {
  PORT: 10406,
};

let lobbies: { [id: string]: Lobby } = {};
const names = [
  "Roddy ST.James",
  "Rita Malone",
  "Whitey",
  "Sid",
  "Toad",
  "Le Frog",
];

export const sleep = async (duration: number) =>
  await new Promise<void>((resolve) => setTimeout(resolve, duration));

class Player {
  name: string;
  ws: WebSocket;
  readyState: boolean;
  id: string;
  lobby: Lobby;
  cards: number[] = [];

  constructor(name: string, ws: WebSocket, lobby: Lobby) {
    this.name = name;
    this.ws = ws;
    this.readyState = false;
    this.id = uuidv4();
    this.lobby = lobby;

    this.ws.on("message", this.handleMessage.bind(this));
    this.ws.onclose = () => this.socketClose();
  }

  handleMessage(e: string) {
    if (!e) return;

    const { type, data } = JSON.parse(e);

    if (type === 1) {
      this.readyState = !this.readyState;

      if (this.lobby.players.every((player) => player.readyState === true)) {
        this.lobby.initGame();
      }
    } else if (type === 2) {
      this.lobby.playedCards.push(data);
      this.cards = this.cards.filter((card) => card !== data);
    } else if (type === 3) {
      if (data) {
        this.name = data;
      }
    }

    this.lobby.alertPlayersList();
  }

  socketClose() {
    this.lobby.players = this.lobby.players.filter((p) => p.ws !== this.ws);

    if (this.lobby.players.length === 0) {
      delete lobbies[this.lobby.id];
    }

    this.lobby.alertPlayersList();
  }
}

class Lobby {
  id: string;
  players: Player[] = [];
  isPlaying: boolean = false;
  playedCards: number[] = [];
  dealtCards: number[] = [];
  lives: number = 0;

  constructor(id: string) {
    this.id = id;
  }

  addPlayer(player: Player) {
    if (!player.ws) return;

    this.players.push(player);

    this.alertPlayersList();
  }

  async initGame() {
    this.isPlaying = true;
    await this.gameloop();
  }

  async gameloop() {
    this.broadcast(2, true);

    let round = 1;
    this.lives = this.players.length;
    this.broadcast(5, this.lives);

    while (round < 8 && this.lives > 0) {
      this.playedCards = [];
      this.dealtCards = [];
      this.initCards(round);
      let hasPlayedAllCards = false;
      let correctCard = true;

      while (!hasPlayedAllCards && correctCard) {
        this.broadcast(4, this.playedCards);
        await this.waitForCard();

        const length = this.playedCards.length;

        correctCard =
          this.playedCards[length - 1] === this.dealtCards[length - 1];

        hasPlayedAllCards = this.players.every(
          (player) => player.cards.length === 0
        );
      }
      if (!correctCard) {
        this.lives -= 1;
        this.broadcast(5, this.lives);
      } else {
        round += 1;
      }
      console.log(correctCard, round);
    }

    if (!this.lives) {
      this.broadcast(6);
      this.gameloop();
    }
  }

  async waitForCard() {
    const length = this.playedCards.length;
    while (length >= this.playedCards.length) {
      await sleep(10);
    }
  }

  alertPlayersList() {
    this.players.forEach((player) => {
      player.ws.send(
        JSON.stringify({
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
        })
      );
    });
  }

  broadcast(type: number, data?: any, ws?: WebSocket) {
    this.players.forEach((player) => {
      player.ws.send(
        JSON.stringify({
          type,
          data,
        })
      );
    });
  }

  initCards(roundIndex: number) {
    console.log("initiating round:" + roundIndex);

    let numbers = [...Array(100).keys()];
    numbers = numbers.sort(() => 0.5 - Math.random());

    this.dealtCards = [];
    this.playedCards = [];

    const cards: { [id: string]: number[] } = {};

    //byt ut mot broadcast function
    this.players.forEach((player) => {
      const _cards = numbers.splice(0, roundIndex);
      player.cards = _cards;
      this.dealtCards.push(..._cards);
      cards[player.id] = _cards;
    });

    this.broadcast(3, cards);

    this.dealtCards = this.dealtCards.sort(function (a, b) {
      return a > b ? 1 : -1;
    });
  }
}

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

router.get("/lobby/:id/", async (ctx) => {
  //connect to lobby
  const id = ctx.params.id;
  if (!ctx.ws || !id) return;

  const ws: WebSocket = await ctx.ws();

  if (!lobbies[id]) {
    console.log(`Creating lobby with id: ${id}`);
    lobbies[id] = new Lobby(id);
  }
  if (!lobbies[id].isPlaying && !(lobbies[id].players.length >= 4)) {
    const _names = names.filter(
      (name) => !lobbies[id].players.map((player) => player.name).includes(name)
    );

    const name = _names[Math.floor(Math.random() * _names.length)];

    lobbies[id].addPlayer(new Player(name, ws, lobbies[id]));
    ctx.body = "Lobby is playing";
  }
});

app.use(koaBody());
app.use(koaWs());
app.use(koaCors());
app.use(router.routes());
app.listen(config.PORT);

console.log(`Started server on port ${config.PORT}`);
