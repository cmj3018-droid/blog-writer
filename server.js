const http = require("http");
const fs = require("fs");
const path = require("path");

require("dotenv").config();

const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.error("");
  console.error("================================");
  console.error("OPENROUTER_API_KEY가 없습니다.");
  console.error("================================");
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

  const requestBody = {
    // 중요:
    // 이미지가 들어오면 openrouter/free가
    // 이미지 입력을 지원하는 무료 모델을 자동 선택
    model: "openrouter/free",

    messages,

    temperature: 0.7,

    max_tokens: 12000
  };


  console.log("");
  console.log("================================");
  console.log("OpenRouter 요청");
  console.log("모델: openrouter/free");
  console.log("================================");


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


  const responseText = await response.text();


  if (!response.ok) {

    console.error("");
    console.error("================================");
    console.error("OpenRouter 오류");
    console.error("================================");
    console.error("상태 코드:", response.status);
    console.error(responseText);
    console.error("================================");

    throw new Error(
      `AI 요청 실패 (${response.status})`
    );
  }


  let result;

  try {

    result = JSON.parse(responseText);

  } catch (error) {

    console.error(responseText);

    throw new Error(
      "AI 응답을 읽을 수 없습니다."
    );
  }


  console.log("");
  console.log("================================");
  console.log("OpenRouter 실제 응답 확인");
  console.log("================================");

  console.log(
    "사용 모델:",
    result?.model || "정보 없음"
  );

  console.log(
    "종료 이유:",
    result?.choices?.[0]?.finish_reason || "정보 없음"
  );

  console.log("================================");


  const message =
    result?.choices?.[0]?.message;


  let text =
    message?.content ||
    result?.choices?.[0]?.text ||
    "";


  // 일부 모델은 content를 배열로 반환할 수 있음
  if (Array.isArray(text)) {

    text = text
      .map((item) => {

        if (typeof item === "string") {
          return item;
        }

        return item?.text || "";
      })
      .join("");
  }


  if (typeof text !== "string") {
    text = String(text || "");
  }


  text = text.trim();


  if (!text) {

    console.error("");
    console.error("AI 응답에 글이 없습니다.");
    console.error("응답 전체:");
    console.error(
      JSON.stringify(result, null, 2)
    );

    throw new Error(
      "AI 응답은 받았지만 글 내용이 없습니다."
    );
  }


  return text;
}


// ======================================================
// 본문 글자 수
// ======================================================

function extractBodyOnly(blogText) {

  let body = blogText || "";


  // 해시태그 제거
  const hashtagIndex =
    body.indexOf("#");

  if (hashtagIndex !== -1) {
    body =
      body.substring(
        0,
        hashtagIndex
      );
  }


  // 매장정보 앞까지 자르는 기존 로직은 제거
  // 최종 후기와 마지막 인사를 정상적으로
  // 본문 글자 수에 포함시키기 위해서임


  // 방문 꿀팁도 본문에 포함
  // 최종 후기와 마지막 인사까지 모두 포함


  const lines =
    body.split("\n");


  // 첫 줄이 제목이면 제거
  if (lines.length > 1) {

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


사진만 보고 확실하지 않은 내용은
사실처럼 작성하지 않는다.


======================================================
★ 매장정보
======================================================

웹 검색 기능은 사용하지 않는다.

따라서 사용자가 입력한 정보가 없는 경우
임의로 주소나 주차정보를 만들지 않는다.


매장정보는 반드시 다음 형식으로 작성한다.


📍 매장정보

🏠 매장명 :
📍 위치 :
🚗 편의시설 :
🅿️ 주차정보 :


확실하지 않은 정보는
"정보 없음"으로 작성한다.


방문일
메뉴
가격

은 매장정보에 넣지 않는다.


======================================================
★ 잔망차차 말투
======================================================

AI가 작성한 딱딱한 문장처럼 쓰지 않는다.

실제로 네이버 블로그를 작성하는 사람처럼
자연스럽고 친근하게 작성한다.


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

같은 표현을 계속 반복하지 않는다.


너무 과장된 광고문구처럼 쓰지 않는다.

실제 블로그 후기처럼
말하듯 자연스럽게 작성한다.


======================================================
★ 제목
======================================================

검색 키워드를 자연스럽게 포함한다.

너무 광고문구처럼 만들지 않는다.


======================================================
★ 시작
======================================================

반드시

"안녕하세요 잔망차차에요! 😊"

느낌으로 시작한다.


사용자가 제공하지 않은
동행인이나 방문 목적은 만들지 않는다.


======================================================
★ 본문 분량
======================================================

본문은 최소 1,800자 이상 작성한다.

가능하면 2,000~2,500자 정도 작성한다.


같은 말을 반복해서 억지로 늘리지 않는다.


======================================================
★ 글 구조
======================================================

반드시 다음 순서를 따른다.


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


각 메뉴마다 가능한 범위에서

음식 비주얼
맛
식감
소스
재료
양
먹었을 때 느낌
다른 메뉴와의 조합

등을 자연스럽게 설명한다.


확실하지 않은 정보는 만들지 않는다.


======================================================
★ 방문 꿀팁
======================================================

확실한 정보만 작성한다.

정보가 없으면

"정보 없음"

이라고 작성한다.


======================================================
★ 한줄평
======================================================

짧고 기억에 남게 작성한다.


======================================================
★ 좋았던 점
======================================================

본문에 실제로 작성된 내용만
3~5개 정도 정리한다.


======================================================
★ 최종 후기
======================================================

매장정보 바로 아래에 작성한다.

최소 2~3개의 자연스러운 문단으로 작성한다.

전체적인 음식 만족도
가장 기억에 남았던 메뉴
실제로 좋았던 점
분위기
메뉴 구성
자연스러운 추천

등을 활용한다.


단순히 메뉴를 다시 나열하지 않는다.


======================================================
★ 마지막 인사
======================================================

최종 후기 다음에는
잔망차차 특유의 인사를 3~5줄 작성한다.


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

사진이 제공되었다면
사진에서 명확하게 확인되는 정보만 활용한다.

사진에서 확실하지 않은 것은
추측하지 않는다.

설명하지 않는다.

URL이나 출처를 작성하지 않는다.

완성된 블로그 글만 출력한다.

`;
}


// ======================================================
// 블로그 생성
// ======================================================

async function generateBlogPost(data) {

  const {
    images
  } = data;


  // ====================================================
  // 이미지 준비
  // ====================================================

  const imageContents =
    Array.isArray(images)

      ? images
          .filter(
            (image) =>
              typeof image === "string" &&
              image.trim()
          )
          .map((image) => ({

            type: "image_url",

            image_url: {
              url: image
            }

          }))

      : [];


  console.log("");
  console.log("================================");
  console.log("AI 블로그 글 생성 시작");
  console.log("================================");

  console.log(
    "첨부 이미지:",
    imageContents.length
  );

  console.log("");


  const initialPrompt =
    buildInitialPrompt(data);


  // ====================================================
  // 이미지가 있으면 text + image
  // 이미지가 없으면 text만
  // ====================================================

  let userContent;


  if (imageContents.length > 0) {

    userContent = [

      {
        type: "text",
        text: initialPrompt
      },

      ...imageContents

    ];

  } else {

    userContent = initialPrompt;
  }


  const initialMessages = [

    {
      role: "user",
      content: userContent
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

  const maxAttempts = 3;


  while (
    bodyText.length < 1800 &&
    attempt < maxAttempts
  ) {

    attempt++;


    console.log("");
    console.log(
      `본문 부족 → ${attempt}차 보완 요청`
    );


    const expandPrompt = `

아래 블로그 글을
잔망차차 스타일로 자연스럽게 보완해줘.


반드시 실제 본문 1,800자 이상 작성한다.

가능하면 2,000~2,500자로 작성한다.


기존 글과 사용자 정보에 없는
새로운 사실을 만들지 않는다.


없는 메뉴
없는 가격
없는 재료
없는 맛
없는 시설
없는 주차
없는 동행인

등을 만들지 않는다.


기존 글의 제목부터 해시태그까지
전체 글을 다시 출력한다.


특히 다음 부분을 충분히 작성한다.

- 자연스러운 도입부
- 매장 분위기
- 메뉴 소개
- 각 메뉴의 실제 후기
- 방문 꿀팁
- 한줄평
- 좋았던 점
- 매장정보
- 최종 후기 2~3문단
- 잔망차차 마지막 인사


현재 글:

--------------------------------

${text}

--------------------------------


현재 본문 글자 수:

${bodyText.length}


설명 없이 완성된 글만 출력한다.

`;


    let expandContent;


    if (imageContents.length > 0) {

      expandContent = [

        {
          type: "text",
          text: expandPrompt
        },

        ...imageContents

      ];

    } else {

      expandContent = expandPrompt;
    }


    const expandMessages = [

      {
        role: "user",
        content: expandContent
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
        extractBodyOnly(text);
    }


    console.log(
      `${attempt}차 보완 후 본문:`,
      bodyText.length
    );
  }


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
            await generateBlogPost(data);


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
          console.error("================================");
          console.error("글 생성 오류");
          console.error("================================");

          console.error(error);

          console.error("================================");


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

              res.writeHead(500);

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


            res.end(data);
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

              res.writeHead(404);

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


            res.end(data);
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

              res.writeHead(404);

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


            res.end(data);
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
