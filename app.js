const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3003, () => {
      console.log("Server Running at http://localhost:3003/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

const getFollowPeopleOfUser = async (username) => {
  const getFollowingPeopleQuery = `
        SELECT
            following_user_id 
        FROM
            follower INNER JOIN user
            ON user.user_id = follower.follower_user_id
        WHERE
            user.username = '${username}';`;
  const getArray = await db.all(getFollowingPeopleQuery);
  const arrayOfId = getArray.map((each) => each.following_user_id);
  return arrayOfId;
};

//Authentication JWT Token
const authenticationToken = (request, response, next) => {
  let jwtToken;
  const authHead = request.headers["authorization"];
  if (authHead !== undefined) {
    jwtToken = authHead.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "aar", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  }
};

const tweetAccessVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getTweetQuery = `
        SELECT
            *
        FROM
            tweet INNER JOIN follower
            ON tweet.user_id = follower.following_user_id
        WHERE
            tweet.tweet_id = '${tweetId}' AND follower_user_id = '${userId}';`;

  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

//User Register API
app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const hashPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `
    SELECT
        *
    FROM
        user
    WHERE
        username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    const createUserQuery = `
            INSERT INTO user(username, name, password, gender)
            VALUES(
                '${username}',
                '${name}',
                '${hashPassword}',
                '${gender}'
            )`;
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      await db.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//User Login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
        SELECT
            *
        FROM
            user
        WHERE
            username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatch = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatch === true) {
      const payload = { username, userId: dbUser.user_id };
      const jwtToken = jwt.sign(payload, "aar");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API 3
app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const { username } = request;
    const followingPeopleIds = await getFollowPeopleOfUser(username);
    const getUserTweetsQuery = `
        SELECT
            user.username,
            tweet.tweet,
            tweet.date_time as dateTime
        FROM
            user INNER JOIN tweet
            ON user.user_id = tweet.user_id
        WHERE
            user.user_id IN (${followingPeopleIds})
        ORDER BY
            date_time DESC
        LIMIT 4;`;
    const getUserTweetsArray = await db.all(getUserTweetsQuery);
    response.send(getUserTweetsArray);
  }
);

//API 4
app.get("/user/following/", authenticationToken, async (request, response) => {
  const { username, userId } = request;
  const getUserFollowingQuery = `
        SELECT
            user.name
        FROM
            follower INNER JOIN user ON user.user_id = follower.following_user_id
        WHERE
            follower_user_id = '${userId}';`;
  const getUserFollowArray = await db.all(getUserFollowingQuery);
  response.send(getUserFollowArray);
});

//API 5
app.get("/user/followers/", authenticationToken, async (request, response) => {
  const { username, userId } = request;
  const getUserTweetsQuery = `
        SELECT
            DISTINCT user.name
        FROM
            follower INNER JOIN user
            ON user.user_id = follower.follower_user_id
        WHERE
            following_user_id = '${userId}';`;
  const getUserTweetsArray = await db.all(getUserTweetsQuery);
  response.send(getUserTweetsArray);
});

//API 6
app.get(
  "/tweets/:tweetId/",
  authenticationToken,
  tweetAccessVerification,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;
    const getTweetsQuery = `
        SELECT
            tweet,
            (SELECT COUNT() FROM like WHERE tweet_id = '${tweetId}') AS likes,
            (SELECT COUNT() FROM reply WHERE tweet_id = '${tweetId}') AS replies,
            date_time AS dateTime
        FROM
            tweet
        WHERE
            tweet.tweet_id = '${tweetId}';`;
    const getTweetDetails = await db.get(getTweetsQuery);
    response.send(getTweetDetails);
  }
);

//API 7
app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikesQuery = `
        SELECT
            username
        FROM
            user INNER JOIN like ON user.user_id = like.user_id
        WHERE
            tweet_id = '${tweetId}';`;
    const likesDetails = await db.all(getLikesQuery);
    const userArray = likesDetails.map((each) => each.username);
    response.send({ likes: userArray });
  }
);

//API 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getRepliesQuery = `
        SELECT
            name,
            reply
        FROM
            user INNER JOIN reply ON user.user_id = reply.user_id
        WHERE
            tweet_id = '${tweetId}';`;
    const repliesDetails = await db.all(getRepliesQuery);
    response.send({ replies: repliesDetails });
  }
);

//API 9
app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const { userId } = request;
  const getTweetsQuery = `
        SELECT
            tweet,
            COUNT(DISTINCT like_id) AS likes,
            COUNT(DISTINCT reply_id) AS replies,
            date_time AS dateTime
        FROM
            tweet LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
            LEFT JOIN like ON tweet.tweet_id = like.tweet_id
        WHERE
            tweet.user_id = ${userId}
        GROUP BY
            tweet.tweet_id;`;
  const tweetsDetails = await db.all(getTweetsQuery);
  response.send(tweetsDetails);
});

//API 10
app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const { tweet } = request.body;
  const userId = parseInt(request.userId);
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
  const createTweetQuery = `
        INSERT INTO tweet(tweet, user_id, date_time)
        VALUES(
            '${tweet}',
            '${userId}',
            '${dateTime}'
        );`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

//API 11
app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request;
    const getTweetQuery = `
        SELECT
            *
        FROM 
            tweet
        WHERE
            user_id = '${userId}' AND tweet_id = '${tweetId}';`;
    const tweet = await db.get(getTweetQuery);

    if (tweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `
            DELETE FROM
                tweet
            WHERE
                tweet_id = '${tweetId}';`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);

module.exports = app;
