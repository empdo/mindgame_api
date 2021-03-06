import Koa from "koa";
import koaBody from "koa-body";
import koaWs from "koa-easy-ws";
import KoaRouter from "@koa/router";
import koaCors from "@koa/cors";
import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import jwt from "jsonwebtoken";
import generateCuid from "cuid";

const app = new Koa();
const router = new KoaRouter({ prefix: "/api" });
const jwtSecret = "secret";

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

const avatarAmount = 5;

class Player {
  name: string;
  ws: WebSocket;
  readyState: boolean;
  id: string;
  lobby: Lobby;
  cards: number[] = [];
  avatarIndex?: number = undefined;

  constructor(name: string, ws: WebSocket, lobby: Lobby, id: string) {
    this.name = name || getRandomName(lobby.id);
    this.ws = ws;
    this.readyState = false;
    this.id = id;
    this.lobby = lobby;

    this.ws.on("message", this.handleMessage.bind(this));
    this.ws.onclose = () => this.socketClose();

    this.getAvatar();
  }

  getAvatar() {
    const indexes = Array.from(
      { length: avatarAmount },
      (_, i) => i + 1
    ).filter((_) => {
      return this.lobby.players.every((_player) => _player.avatarIndex !== _);
    });

    this.avatarIndex = indexes[Math.floor(Math.random() * indexes.length)];
  }

  handleMessage(e: string) {
    if (!e) return;

    const { type, data } = JSON.parse(e);

    if (type === 1) {
      this.readyState = !this.readyState;

      if (this.lobby.players.every((player) => player.readyState === true)) {
        this.lobby.initGame();
      }

      this.lobby.alertPlayersList();
    } else if (type === 2) {
      this.lobby.playedCards.push(data);
      this.cards = this.cards.filter((card) => card !== data);

      const object: { [id: string]: number[] } = {};
      this.lobby.players.forEach((player) => {
        object[player.id] = player.cards;
      });

      this.lobby.broadcast(3, object);
    } else if (type === 3) {
      if (data) {
        this.name = data;
      } else {
        this.name = getRandomName(this.lobby.id);
      }
    }

    //    this.lobby.alertPlayersList();
  }

  initPlayer = () => {
    //g??r om denna funktion
    console.log("init player: ", this.id);

    this.ws.on("message", this.handleMessage.bind(this));
    this.ws.onclose = () => this.socketClose();

    this.ws.send(
      JSON.stringify({
        type: 1,
        data: this.lobby.players.map((_player) => {
          return {
            name: _player.name,
            readyState: _player.readyState,
            cards: _player.cards,
            local: _player.ws === this.ws,
            id: _player.id,
            avatarIndex: _player.avatarIndex,
          };
        }),
      })
    );

    this.ws.send(JSON.stringify({ type: 8, data: this.lobby.round }));

    const _data: { [id: string]: number[] } = {};
    this.lobby.players.forEach((player) => {
      _data[player.id] = player.cards;
    });
    this.ws.send(
      JSON.stringify({
        type: 3,
        data: _data,
      })
    );
    this.ws.send(
      JSON.stringify({
        type: 4,
        data: this.lobby.playedCards,
      })
    );
    this.ws.send(
      JSON.stringify({
        type: 5,
        data: { lives: this.lobby.lives, totalLives: this.lobby.totalLives },
      })
    );
    this.ws.send(
      JSON.stringify({
        type: 2,
        data: true,
      })
    );
  };

  async socketClose() {
    await sleep(10000);
    console.log("socket close");

    const connected = this.lobby.players.filter(
      (player) => player.ws.readyState === WebSocket.OPEN
    );

    if (connected.length === 0) {
      this.lobby.resetLobby();
      this.lobby.players = [];
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
  round: number = 1;
  dealtCardsObject: { [id: string]: number[] } = {};
  totalLives: number = 0;

  constructor(id: string, players?: Player[]) {
    this.id = id;
    this.players = players || [];
  }

  addPlayer(player: Player, index?: number) {
    if (!player.ws) return;
    console.log("add player: ", player.id);

    if (index !== -1 && index !== undefined) {
      this.players[index] = player;
    } else {
      this.players.push(player);
    }

    this.alertPlayersList();
  }

  removePlayer = (player: Player) => {
    this.players = this.players.filter((p) => p.id !== player.id);
  };

  async initGame() {
    this.isPlaying = true;
    await this.gameloop(1);
  }

  async gameloop(startRound: number) {
    this.broadcast(2, true);

    this.round = startRound;
    this.lives = this.players.length;
    this.totalLives = this.lives;
    this.broadcast(5, { lives: this.lives, totalLives: this.totalLives });

    while (this.round < 12 - this.players.length && this.lives > 0) {
      this.playedCards = [];
      this.dealtCards = [];
      this.initCards(this.round);
      let hasPlayedAllCards = false;
      let correctCard = true;
      this.broadcast(8, this.round);

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
        this.broadcast(5, { lives: this.lives, totalLives: this.totalLives });
      } else {
        this.round += 1;
        if ([3, 6, 9].includes(this.round)) {
          this.lives++;
          this.totalLives++;
          this.broadcast(5, { lives: this.lives, totalLives: this.totalLives });
        }
      }
    }

    if (!this.lives) {
      this.broadcast(6, true);
    } else {
      this.broadcast(7, undefined);
    }

    this.resetLobby();
  }

  resetLobby() {
    lobbies[this.id] = new Lobby(this.id, this.players);
    this.players = this.players.map((player) => {
      player.readyState = false;
      return player;
    });
    this.alertPlayersList();
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
              avatarIndex: _player.avatarIndex,
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

    //byt ut mot broadcast function
    this.players.forEach((player) => {
      const _cards = numbers.splice(0, roundIndex);
      player.cards = _cards;
      this.dealtCards.push(..._cards);
      this.dealtCardsObject[player.id] = _cards;
    });

    this.broadcast(3, this.dealtCardsObject);

    this.dealtCards = this.dealtCards.sort(function (a, b) {
      return a > b ? 1 : -1;
    });
  }
}

const getRandomName = (id: string) => {
  const _names = names.filter(
    (name) => !lobbies[id].players.map((player) => player.name).includes(name)
  );

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
    _token = jwt.verify(bodyToken, jwtSecret) as jwt.JwtPayload;
  }
  const sub = _token ? _token.sub : generateCuid();

  const token = jwt.sign({ name, sub }, jwtSecret);
  ctx.body = JSON.stringify({ token });
});

router.get("/lobby/:id/", async (ctx) => {
  //connect to lobby
  const id = ctx.params.id;

  const queryToken = ctx.request.query["token"] as string;
  const token = jwt.verify(queryToken, jwtSecret) as jwt.JwtPayload;

  if (!ctx.ws || !id || !token) return;
  const ws: WebSocket = await ctx.ws();

  if (!lobbies[id]) {
    console.log(`Creating lobby with id: ${id}`);
    lobbies[id] = new Lobby(id);
  }

  const ids = lobbies[id].players.map((player) => player.id);
  let index = ids.indexOf(token.sub!);

  const player = lobbies[id].players.find((player) => player.id === token.sub);

  if (player && lobbies[id].isPlaying && lobbies[id].players.length < 4) {
    player.ws = ws;

    player.initPlayer();
  } else if (lobbies[id].players.length < 4) {
    const player = new Player(token.name, ws, lobbies[id], token.sub!);
    console.log("adding player");

    if (!lobbies[id].isPlaying) {
      lobbies[id].addPlayer(player, index);
    }
  }

  ctx.body = "sa";
});

app.use(koaBody());
app.use(koaWs());
app.use(koaCors());
app.use(router.routes());
app.listen(config.PORT);

console.log(`Started server on port ${config.PORT}`);
