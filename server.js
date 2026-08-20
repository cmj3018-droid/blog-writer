const http = require("http");
const fs = require("fs");
const path = require("path");

require("dotenv").config();

const PORT = process.env.PORT || 3000;

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY;


// ======================================================
// 기본 확인
// ======================================================

if (!OPENROUTER_API_KEY) {

  console.error("");
  console.error("================================");
  console.error("OPENROUTER_API_KEY가 없습니다.");
  console.error("================================");
  console.error("");

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

      if (
        body.length >
        30 * 1024 * 1024
      ) {

        reject(
          new Error(
            "업로드 용량이 너무 큽니다."
          )
        );

        req.destroy();
      }
    });


    req.on("end", () => {

      try {

        const data =
          JSON.parse(body);

        resolve(data);

      } catch (error) {

        reject(
          new Error(
            "잘못된 JSON 데이터입니다."
          )
        );
      }
    });


    req.on("error", reject);

  });
}


// ======================================================
// OpenRouter AI 요청
// ======================================================

async function callOpenRouter(messages) {

  console.log("");
  console.log("================================");
  console.log("OpenRouter 요청");
  console.log("모델: openrouter/free");
  console.log("================================");
  console.log("");


  const requestBody = {

    model:
      "openrouter/free",

    messages,

    temperature: 0.7,

    max_tokens: 6000

  };


  const response =
    await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {

        method: "POST",

        headers: {

          "Authorization":
            `Bearer ${OPENROUTER_API_KEY}`,

          "Content-Type":
            "application/json",

          "HTTP-Referer":
            "https://blog-writer-42ic.onrender.com",

          "X-Title":
            "Janmangchacha Blog Writer"

        },

        body:
          JSON.stringify(
            requestBody
          )

      }
    );


  const responseText =
    await response.text();


  console.log("");
  console.log("================================");
  console.log("OpenRouter 실제 응답");
  console.log("================================");
  console.log(responseText);
  console.log("================================");
  console.log("");


  // ----------------------------------------------------
  // HTTP 오류
  // ----------------------------------------------------

  if (!response.ok) {

    let errorMessage =
      `AI 요청 실패 (${response.status})`;

    try {

      const errorData =
        JSON.parse(
          responseText
        );

      if (
        errorData?.error?.message
      ) {

        errorMessage =
          errorData.error.message;
      }

    } catch (error) {

      // JSON이 아니면 기본 오류 사용

    }


    throw new Error(
      errorMessage
    );
  }


  // ----------------------------------------------------
  // JSON 파싱
  // ----------------------------------------------------

  let result;

  try {

    result =
      JSON.parse(
        responseText
      );

  } catch (error) {

    console.error(
      "JSON 파싱 실패"
    );

    console.error(
      responseText
    );

    throw new Error(
      "AI 응답을 읽을 수 없습니다."
    );
  }


  // ----------------------------------------------------
  // OpenRouter 내부 오류
  // ----------------------------------------------------

  if (
    result &&
    result.error
  ) {

    console.error(
      "OpenRouter 내부 오류:"
    );

    console.error(
      JSON.stringify(
        result.error,
        null,
        2
      )
    );


    throw new Error(
      result.error.message ||
      "OpenRouter에서 AI 응답을 받지 못했습니다."
    );
  }


  // ----------------------------------------------------
  // choices 확인
  // ----------------------------------------------------

  const choice =
    result?.choices?.[0];


  if (!choice) {

    console.error(
      "AI 응답에 choices가 없습니다."
    );

    console.error(
      JSON.stringify(
        result,
        null,
        2
      )
    );


    throw new Error(
      "AI 응답에 choices가 없습니다."
    );
  }


  // ----------------------------------------------------
  // message 확인
  // ----------------------------------------------------

  const message =
    choice.message || {};


  let text =
    message.content || "";


  // ----------------------------------------------------
  // content가 배열인 경우
  // ----------------------------------------------------

  if (
    Array.isArray(text)
  ) {

    text =
      text
        .map((item) => {

          if (
            typeof item ===
            "string"
          ) {

            return item;
          }


          if (
            item &&
            typeof item.text ===
              "string"
          ) {

            return item.text;
          }


          return "";

        })
        .join("");
  }


  // ----------------------------------------------------
  // 혹시 choice.text 형태인 경우
  // ----------------------------------------------------

  if (
    !text &&
    typeof choice.text ===
      "string"
  ) {

    text =
      choice.text;
  }


  // ----------------------------------------------------
  // 최종 문자열 변환
  // ----------------------------------------------------

  text =
    String(
      text || ""
    ).trim();


  // ----------------------------------------------------
  // 글이 없는 경우
  // ----------------------------------------------------

  if (!text) {

    console.error("");
    console.error(
      "================================"
    );
    console.error(
      "AI 응답은 받았지만 글 내용이 없습니다."
    );
    console.error(
      "================================"
    );

    console.error(
      JSON.stringify(
        result,
        null,
        2
      )
    );


    throw new Error(
      "AI 응답은 받았지만 글 내용이 없습니다."
    );
  }


  return text;
}


// ======================================================
// 본문 글자 수 계산
// ======================================================

function extractBodyOnly(blogText) {

  let body =
    blogText || "";


  // ----------------------------------------------------
  // 해시태그 제거
  // ----------------------------------------------------

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


  // ----------------------------------------------------
  // 매장정보 이전까지 자르는 기존 방식 제거
  //
  // 매장정보 아래 최종후기도 본문으로 계산해야 함
  // ----------------------------------------------------


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
자연스럽고 친근한 맛집 블로그 글을 작성해줘.


======================================================
★ 가장 중요한 원칙
======================================================

사용자가 제공한 정보만 사용한다.

사용자가 제공하지 않은 사실을 절대로 만들지 않는다.


없는 메뉴
없는 가격
없는 재료
없는 맛
없는 식감
없는 양
없는 주차
없는 시설
없는 웨이팅
없는 직원 이야기
없는 서비스
없는 동행인
없는 방문 목적

등을 절대로 만들지 않는다.


확실하지 않은 내용은
"정보 없음"으로 작성한다.


======================================================
★ 매장정보
======================================================

웹 검색을 하지 않는다.

사용자가 입력하지 않은 주소나
주차정보를 임의로 만들지 않는다.


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

AI가 쓴 것처럼 딱딱하게 작성하지 않는다.

실제 네이버 블로그를 작성하는 사람처럼
자연스럽고 편안하게 작성한다.


다음과 같은 표현을 자연스럽게 사용한다.

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
🥰
😋


단,

같은 표현을 계속 반복하지 않는다.


과도하게 광고처럼 작성하지 않는다.


======================================================
★ 시작
======================================================

반드시 다음과 비슷한 느낌으로 시작한다.


안녕하세요 잔망차차에요! 😊


그 다음 자연스럽게
오늘 방문한 매장을 소개한다.


사용자가 제공하지 않은
동행인이나 방문 목적을 만들지 않는다.


======================================================
★ 제목
======================================================

검색 키워드를 자연스럽게 포함한다.

너무 광고처럼 만들지 않는다.

제목에는 매장명과
가능하면 지역 및 대표 메뉴를 자연스럽게 포함한다.


======================================================
★ 본문 분량
======================================================

본문은 반드시 최소 1,800자 이상 작성한다.

가능하면 2,000~2,500자 정도 작성한다.


같은 말을 반복해서 억지로 글자 수를 늘리지 않는다.


======================================================
★ 글 구조
======================================================

반드시 다음 순서를 지킨다.


1. 제목

2. 잔망차차 인사 + 자연스러운 도입부

3. 🌿 매장 분위기와 첫인상

4. 📜 메뉴 살펴보기

5. 🍝 주문한 메뉴별 상세 후기

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

사용자가 입력한 메뉴만 작성한다.


각 메뉴마다 별도의 소제목을 작성한다.


사용자가 제공한 정보 범위 안에서

음식의 모습
맛
식감
소스
재료
양
먹었을 때 느낌
메뉴의 특징

등을 자연스럽게 설명한다.


단,

사용자가 제공하지 않은 정보를
사실처럼 만들지 않는다.


======================================================
★ 방문 꿀팁
======================================================

확실한 정보가 있는 경우에만 작성한다.

정보가 없다면

"현재 제공된 정보로는 확인할 수 없어요."

정도로 자연스럽게 작성한다.


없는 웨이팅이나
없는 주차정보 등을 만들지 않는다.


======================================================
★ 한줄평
======================================================

짧고 기억에 남게 작성한다.

실제 작성한 본문의 내용과
일치해야 한다.


======================================================
★ 좋았던 점
======================================================

본문에 실제로 작성한 내용만 사용한다.

3~5개 정도 작성한다.


======================================================
★ 매장정보 이후 최종 후기
======================================================

매장정보 바로 아래에
최종 후기를 작성한다.


최종 후기는 최소 2~3개의
자연스러운 문단으로 작성한다.


단순히 메뉴를 다시 나열하지 않는다.


전체적인 만족도

가장 기억에 남은 부분

좋았던 점

분위기

메뉴 구성

자연스러운 추천

등을 활용한다.


======================================================
★ 마지막 인사
======================================================

최종 후기 다음에는

잔망차차 특유의 따뜻한 마지막 인사를
3~5줄 정도 작성한다.


억지로 반복하지 않는다.


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


설명하지 않는다.

AI가 작성했다는 설명을 하지 않는다.

URL이나 출처를 작성하지 않는다.

프롬프트에 대한 설명을 하지 않는다.

완성된 블로그 글만 출력한다.


다시 한 번 강조한다.

본문은 반드시 1,800자 이상 작성한다.

없는 사실은 절대로 만들지 않는다.

최종 후기와 마지막 인사를 반드시 작성한다.

`;
}


// ======================================================
// 블로그 생성
// ======================================================

async function generateBlogPost(data) {

  console.log("");
  console.log("================================");
  console.log("AI 블로그 글 생성 시작");
  console.log("================================");
  console.log("");


  // ----------------------------------------------------
  // 중요
  //
  // 현재 무료 모델에서 이미지 입력을 지원하지 않는
  // 경우가 있어 사진은 OpenRouter로 보내지 않는다.
  //
  // 사이트에서 사진을 업로드하는 기능 자체는 유지된다.
  // ----------------------------------------------------


  const initialPrompt =
    buildInitialPrompt(data);


  const initialMessages = [

    {
      role: "user",

      content:
        initialPrompt

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
  // 글자 수 부족하면 최대 2번 보완
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
      `${attempt}차 글 보완 시작`
    );

    console.log(
      "================================"
    );


    const expandPrompt = `

아래 네이버 맛집 블로그 글을
"잔망차차" 스타일로 자연스럽게 보완해줘.


반드시 본문 1,800자 이상으로 작성한다.

가능하면 2,000~2,500자 정도로 작성한다.


중요:

기존 글과 사용자 정보에 없는
새로운 사실을 절대로 만들지 않는다.


없는 메뉴
없는 가격
없는 재료
없는 맛
없는 식감
없는 시설
없는 주차
없는 웨이팅
없는 동행인
없는 서비스

등을 절대로 만들지 않는다.


기존 글의 사실은 유지한다.


제목부터 해시태그까지
전체 글을 다시 출력한다.


최종 후기와
잔망차차 마지막 인사도
반드시 포함한다.


현재 본문 글자 수:

${bodyText.length}


현재 글:

--------------------------------

${text}

--------------------------------


설명 없이
완성된 블로그 글만 출력한다.

`;


    const expandMessages = [

      {
        role: "user",

        content:
          expandPrompt

      }

    ];


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


    console.log(
      `${attempt}차 보완 후 본문:`,
      bodyText.length
    );

  }


  console.log("");
  console.log("================================");
  console.log("AI 블로그 글 생성 완료");
  console.log("최종 본문 글자 수:", bodyText.length);
  console.log("================================");
  console.log("");


  return text;
}


// ======================================================
// 서버 생성
// ======================================================

const server =
  http.createServer(
    async (req, res) => {


      // ==================================================
      // API
      // ==================================================

      if (
        req.url === "/api/generate" &&
        req.method === "POST"
      ) {

        try {

          const data =
            await readRequestBody(
              req
            );


          console.log("");
          console.log(
            "매장명:",
            data.storeName ||
              "정보 없음"
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
            JSON.stringify(
              {
                text
              }
            )
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

          console.error(
            error
          );


          res.writeHead(
            500,
            {
              "Content-Type":
                "application/json; charset=utf-8"
            }
          );


          res.end(
            JSON.stringify(
              {
                error:
                  error.message ||
                  "글 생성 중 오류가 발생했습니다."
              }
            )
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

              console.error(
                "index.html 오류:",
                err
              );


              res.writeHead(
                500,
                {
                  "Content-Type":
                    "text/plain; charset=utf-8"
                }
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
                404,
                {
                  "Content-Type":
                    "text/plain; charset=utf-8"
                }
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
                404,
                {
                  "Content-Type":
                    "text/plain; charset=utf-8"
                }
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
