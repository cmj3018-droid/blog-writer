const http = require("http");
const fs = require("fs");
const path = require("path");

require("dotenv").config();

const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.error("OPENROUTER_API_KEY가 없습니다.");
  process.exit(1);
}


// ======================================================
// JSON 요청 받기
// ======================================================

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;

      if (body.length > 30 * 1024 * 1024) {
        reject(new Error("업로드 용량이 너무 큽니다."));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("잘못된 JSON 데이터입니다."));
      }
    });

    req.on("error", reject);
  });
}


// ======================================================
// OpenRouter AI 요청
// ======================================================

async function callOpenRouter(messages) {

  // 무료 모델 순서
  const models = [
    "openai/gpt-oss-20b:free",
    "qwen/qwen3-30b-a3b:free",
    "meta-llama/llama-3.3-70b-instruct:free"
  ];


  let lastError = null;


  for (const model of models) {

    console.log("");
    console.log("================================");
    console.log("OpenRouter 요청");
    console.log("모델:", model);
    console.log("================================");


    try {

      const requestBody = {
        model,
        messages,

        temperature: 0.7,

        max_tokens: 12000
      };


      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",

          headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",

            "HTTP-Referer":
              "https://blog-writer-42ic.onrender.com",

            "X-Title":
              "Janmangchacha Blog Writer"
          },

          body: JSON.stringify(requestBody)
        }
      );


      const responseText =
        await response.text();


      console.log("");
      console.log("================================");
      console.log("OpenRouter 응답 상태");
      console.log("모델:", model);
      console.log("상태 코드:", response.status);
      console.log("================================");


      // --------------------------------------------------
      // HTTP 오류
      // --------------------------------------------------

      if (!response.ok) {

        console.error("OpenRouter 오류:");
        console.error(responseText);

        lastError =
          new Error(
            `AI 요청 실패 (${response.status})`
          );

        // 다음 무료 모델 시도
        continue;
      }


      // --------------------------------------------------
      // JSON 파싱
      // --------------------------------------------------

      let result;

      try {

        result =
          JSON.parse(responseText);

      } catch (error) {

        console.error("JSON 파싱 실패");
        console.error(responseText);

        lastError =
          new Error(
            "AI 응답을 읽을 수 없습니다."
          );

        continue;
      }


      // --------------------------------------------------
      // 실제 응답 확인
      // --------------------------------------------------

      console.log("");
      console.log("================================");
      console.log("OpenRouter 실제 응답");
      console.log("================================");

      console.log(
        JSON.stringify(
          result,
          null,
          2
        )
      );

      console.log("================================");


      const choice =
        result?.choices?.[0];

      const message =
        choice?.message;


      // --------------------------------------------------
      // content 추출
      // --------------------------------------------------

      let text =
        message?.content ||
        choice?.text ||
        "";


      // content가 배열로 오는 경우
      if (Array.isArray(text)) {

        text =
          text
            .map((item) => {

              if (
                typeof item === "string"
              ) {
                return item;
              }

              return item?.text || "";
            })
            .join("");
      }


      if (
        typeof text !== "string"
      ) {

        text =
          String(
            text || ""
          );
      }


      text =
        text.trim();


      // --------------------------------------------------
      // content가 없는 경우
      // --------------------------------------------------

      if (!text) {

        console.error("");
        console.error(
          "AI 응답은 받았지만 글 내용이 없습니다."
        );

        console.error(
          "finish_reason:",
          choice?.finish_reason
        );

        console.error(
          "message:",
          JSON.stringify(
            message,
            null,
            2
          )
        );


        lastError =
          new Error(
            "AI 응답은 받았지만 글 내용이 없습니다."
          );

        // 다음 모델 시도
        continue;
      }


      console.log("");
      console.log("================================");
      console.log("AI 글 생성 성공");
      console.log("사용 모델:", model);
      console.log("글자 수:", text.length);
      console.log("================================");
      console.log("");


      return text;

    } catch (error) {

      console.error("");
      console.error(
        "OpenRouter 통신 오류:"
      );

      console.error(error);

      lastError = error;

      // 다음 모델 시도
      continue;
    }
  }


  // 모든 모델 실패
  throw (
    lastError ||
    new Error(
      "사용 가능한 AI 모델이 없습니다."
    )
  );
}


// ======================================================
// 본문 글자 수
// ======================================================

function extractBodyOnly(blogText) {

  let body =
    blogText || "";


  // 해시태그 제거
  const hashtagIndex =
    body.indexOf("#");

  if (
    hashtagIndex !== -1
  ) {

    body =
      body.substring(
        0,
        hashtagIndex
      );
  }


  // 매장정보 이전까지만 잘라버리는 기존 방식은 제거
  // 최종 후기와 마지막 인사까지 본문 글자 수에 포함


  const lines =
    body.split("\n");


  // 제목 제거
  if (
    lines.length > 1
  ) {

    lines.shift();

    body =
      lines.join("\n");
  }


  return body.trim();
}


// ======================================================
// 블로그 프롬프트
// ======================================================

function buildInitialPrompt(data) {

  const {
    storeName,
    location,
    visitDate,
    menu,
    memo,
    keywords,
    titleKeyword,
    tone,
    experience,
    provided,
    disclosure
  } = data;


  return `

너는 네이버 맛집 블로그 전문 작가
"잔망차차"야.

사용자가 직접 방문해서 작성한 것처럼
자연스럽고 친근한 맛집 후기를 작성해줘.


======================================================
★ 가장 중요한 원칙
======================================================

사용자가 제공한 정보와
사진에서 명확하게 확인되는 정보만 사용한다.

없는 사실을 절대로 만들지 않는다.


없는 메뉴
없는 가격
없는 재료
없는 맛
없는 식감
없는 주차
없는 시설
없는 웨이팅
없는 직원 이야기
없는 서비스
없는 동행인
없는 방문 목적

등을 절대로 만들어내지 않는다.


확실하지 않은 정보는
"정보 없음"이라고 작성한다.


======================================================
★ 웹 검색
======================================================

웹 검색을 하지 않는다.

사용자가 제공하지 않은 주소,
주차정보,
편의시설,
영업시간 등을
임의로 만들지 않는다.


======================================================
★ 매장정보
======================================================

반드시 다음 형식을 사용한다.


📍 매장정보

🏠 매장명 :
📍 위치 :
🚗 편의시설 :
🅿️ 주차정보 :


정보가 없으면

정보 없음

이라고 작성한다.


방문일
메뉴
가격

은 매장정보에 넣지 않는다.


======================================================
★ 잔망차차 말투
======================================================

AI가 쓴 것처럼 딱딱하게 쓰지 않는다.

실제로 네이버 블로그를 쓰는 사람이
작성한 것처럼 자연스럽게 작성한다.


자연스럽게 다음 표현을 섞는다.

~더라고요
~했답니다
~좋았어요
~맛있었어요
~괜찮더라고요
~마음에 들었어요
ㅎㅎ
😊
💕
💖


단,
같은 표현을 반복하지 않는다.


======================================================
★ 제목
======================================================

검색 키워드를 자연스럽게 포함한다.

광고처럼 과장하지 않는다.


======================================================
★ 시작
======================================================

반드시

안녕하세요 잔망차차에요! 😊

느낌으로 시작한다.


사용자가 제공하지 않은
동행인이나 방문 목적을 만들지 않는다.


======================================================
★ 본문 분량
======================================================

본문은 반드시 최소 1,800자 이상 작성한다.

가능하면 2,000~2,500자 정도 작성한다.


글자 수를 늘리기 위해
같은 내용을 반복하지 않는다.


정보가 부족하더라도
없는 사실을 만들어서 분량을 채우지 않는다.


======================================================
★ 글 구조
======================================================

반드시 다음 순서로 작성한다.


1. 제목

2. 인사 + 자연스러운 도입부

3. 🌿 매장 분위기와 첫인상

4. 📜 메뉴 살펴보기

5. 주문한 메뉴별 상세 후기

6. 💡 방문 꿀팁

7. 💬 한줄평

8. 👍 좋았던 점

9. 📍 매장정보

10. 최종 후기

11. 잔망차차 마지막 인사

12. 해시태그


======================================================
★ 메뉴 후기
======================================================

사용자가 실제로 주문했다고 입력한 메뉴만 작성한다.

메뉴마다 별도의 소제목을 사용한다.


사용자가 제공한 정보 범위 안에서

음식 비주얼
맛
식감
소스
재료
양
먹었을 때 느낌
다른 메뉴와의 조합

등을 자연스럽게 설명한다.


확실하지 않은 내용은
절대로 만들지 않는다.


======================================================
★ 방문 꿀팁
======================================================

확실한 정보만 작성한다.

정보가 없으면

"이번 방문에서는 별도로 확인하지 못했어요."

등 자연스럽게 작성한다.


없는 정보를 만들지 않는다.


======================================================
★ 한줄평
======================================================

짧고 기억에 남게 작성한다.


======================================================
★ 좋았던 점
======================================================

본문에서 실제로 언급한 내용만
3~5개 정리한다.


======================================================
★ 최종 후기
======================================================

매장정보 바로 아래에 작성한다.

최소 2~3개의 자연스러운 문단으로 작성한다.


앞에서 작성한 내용을
그대로 반복하지 않는다.


전체적인 음식 만족도,
가장 기억에 남은 부분,
좋았던 점,
분위기,
메뉴 구성,
자연스러운 추천

등을 활용해서
실제 방문 후기처럼 마무리한다.


======================================================
★ 마지막 인사
======================================================

최종 후기 다음에는
잔망차차 특유의 인사를
3~5줄 작성한다.


따뜻하고 자연스럽게 마무리한다.


======================================================
★ 해시태그
======================================================

마지막 줄에
관련 해시태그 10~15개를 작성한다.


======================================================
★ 사용자 정보
======================================================

매장명:
${storeName || "정보 없음"}

위치:
${location || "정보 없음"}

방문일:
${visitDate || "정보 없음"}

메뉴:
${menu || "정보 없음"}

메모:
${memo || "정보 없음"}

키워드:
${keywords || "정보 없음"}

제목 키워드:
${titleKeyword || "정보 없음"}

말투:
${tone || "잔망차차 스타일"}

경험:
${experience || "정보 없음"}

제공 정보:
${provided || "정보 없음"}

협찬/고지:
${disclosure || "정보 없음"}


======================================================
★ 최종 요청
======================================================

위 정보를 이용해서
완성된 네이버 맛집 블로그 글을 작성한다.

최소 1,800자 이상 작성한다.

가능하면 2,000~2,500자 정도 작성한다.

설명하지 않는다.

URL이나 출처를 작성하지 않는다.

AI라는 말을 하지 않는다.

완성된 블로그 글만 출력한다.

`;
}


// ======================================================
// 블로그 생성
// ======================================================

async function generateBlogPost(data) {

  const initialPrompt =
    buildInitialPrompt(data);


  console.log("");
  console.log("================================");
  console.log("AI 블로그 글 생성 시작");
  console.log("================================");
  console.log("");


  // --------------------------------------------------
  // 중요
  //
  // 현재 무료 모델 중 이미지 입력을 지원하지 않는
  // 모델이 있으므로 첫 요청에서는 이미지 전송 안 함.
  //
  // 이미지 때문에 404가 나는 문제를 방지한다.
  // --------------------------------------------------

  const initialMessages = [
    {
      role: "user",
      content: initialPrompt
    }
  ];


  let text =
    await callOpenRouter(
      initialMessages
    );


  let bodyText =
    extractBodyOnly(text);


  console.log(
    "1차 본문 글자 수:",
    bodyText.length
  );


  // ====================================================
  // 글자 수 부족하면 보완
  // ====================================================

  let attempt = 0;

  const maxAttempts = 2;


  while (
    bodyText.length < 1800 &&
    attempt < maxAttempts
  ) {

    attempt++;


    console.log("");
    console.log(
      "================================"
    );

    console.log(
      `${attempt}차 글자 수 보완 시작`
    );

    console.log(
      "현재 글자 수:",
      bodyText.length
    );

    console.log(
      "================================"
    );


    const expandPrompt = `

아래 네이버 맛집 블로그 글을
잔망차차 스타일로 다시 작성해줘.


가장 중요한 조건:

실제 본문이 반드시 1,800자 이상이어야 한다.

가능하면 2,000~2,500자 정도로 작성한다.


단순히 같은 문장을 반복해서
글자 수를 늘리지 않는다.


사용자가 제공하지 않은 사실을
절대로 추가하지 않는다.


없는 메뉴
없는 가격
없는 재료
없는 맛
없는 식감
없는 시설
없는 주차
없는 웨이팅
없는 직원 이야기
없는 서비스
없는 동행인

등을 만들지 않는다.


기존 글에서 확인 가능한 정보만 사용한다.


제목부터 해시태그까지
완성된 전체 블로그 글을 다시 출력한다.


현재 글:

--------------------------------

${text}

--------------------------------


현재 본문 글자 수:

${bodyText.length}


설명 없이 완성된 블로그 글만 출력한다.

`;


    const expandMessages = [
      {
        role: "user",
        content: expandPrompt
      }
    ];


    try {

      const expandedText =
        await callOpenRouter(
          expandMessages
        );


      if (
        expandedText &&
        expandedText.trim()
      ) {

        text =
          expandedText.trim();

        bodyText =
          extractBodyOnly(
            text
          );
      }

    } catch (error) {

      console.error(
        "보완 요청 실패:",
        error
      );

      // 기존 글이라도 반환
      break;
    }


    console.log(
      `${attempt}차 보완 후 본문:`,
      bodyText.length
    );
  }


  console.log("");
  console.log("================================");
  console.log("최종 글 생성 완료");
  console.log("최종 본문 글자 수:", bodyText.length);
  console.log("================================");
  console.log("");


  return text;
}


// ======================================================
// 서버
// ======================================================

const server =
  http.createServer(
    async (req, res) => {


      // ==================================================
      // AI 글 생성
      // ==================================================

      if (
        req.url === "/api/generate" &&
        req.method === "POST"
      ) {

        try {

          const data =
            await readRequestBody(req);


          console.log(
            "매장명:",
            data.storeName || "정보 없음"
          );


          const text =
            await generateBlogPost(
              data
            );


          res.writeHead(
            200,
            {
              "Content-Type":
                "application/json; charset=utf-8"
            }
          );


          res.end(
            JSON.stringify({
              text
            })
          );


        } catch (error) {

          console.error("");
          console.error(
            "================================"
          );

          console.error(
            "글 생성 오류"
          );

          console.error(
            "================================"
          );

          console.error(error);

          console.error(
            "================================"
          );


          res.writeHead(
            500,
            {
              "Content-Type":
                "application/json; charset=utf-8"
            }
          );


          res.end(
            JSON.stringify({
              error:
                error.message ||
                "글 생성 중 오류가 발생했습니다."
            })
          );
        }

        return;
      }


      // ==================================================
      // 메인 페이지
      // ==================================================

      if (
        req.url === "/" &&
        req.method === "GET"
      ) {

        const filePath =
          path.join(
            __dirname,
            "public",
            "index.html"
          );


        fs.readFile(
          filePath,
          "utf8",
          (err, data) => {

            if (err) {

              res.writeHead(
                500
              );

              res.end(
                "index.html을 찾을 수 없습니다."
              );

              return;
            }


            res.writeHead(
              200,
              {
                "Content-Type":
                  "text/html; charset=utf-8"
              }
            );


            res.end(
              data
            );
          }
        );

        return;
      }


      // ==================================================
      // CSS
      // ==================================================

      if (
        req.url === "/style.css" &&
        req.method === "GET"
      ) {

        const filePath =
          path.join(
            __dirname,
            "public",
            "style.css"
          );


        fs.readFile(
          filePath,
          "utf8",
          (err, data) => {

            if (err) {

              res.writeHead(
                404
              );

              res.end(
                "CSS 파일을 찾을 수 없습니다."
              );

              return;
            }


            res.writeHead(
              200,
              {
                "Content-Type":
                  "text/css; charset=utf-8"
              }
            );


            res.end(
              data
            );
          }
        );

        return;
      }


      // ==================================================
      // JavaScript
      // ==================================================

      if (
        req.url === "/script.js" &&
        req.method === "GET"
      ) {

        const filePath =
          path.join(
            __dirname,
            "public",
            "script.js"
          );


        fs.readFile(
          filePath,
          "utf8",
          (err, data) => {

            if (err) {

              res.writeHead(
                404
              );

              res.end(
                "JavaScript 파일을 찾을 수 없습니다."
              );

              return;
            }


            res.writeHead(
              200,
              {
                "Content-Type":
                  "application/javascript; charset=utf-8"
              }
            );


            res.end(
              data
            );
          }
        );

        return;
      }


      // ==================================================
      // 404
      // ==================================================

      res.writeHead(
        404,
        {
          "Content-Type":
            "text/plain; charset=utf-8"
        }
      );


      res.end(
        "페이지를 찾을 수 없습니다."
      );
    }
  );


// ======================================================
// 서버 실행
// ======================================================

server.listen(
  PORT,
  () => {

    console.log("");
    console.log("================================");
    console.log(
      "블로그 초안 생성기가 실행되었습니다."
    );

    console.log(
      `포트: ${PORT}`
    );

    console.log("================================");
    console.log("");
  }
);
