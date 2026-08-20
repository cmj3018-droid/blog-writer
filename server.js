const http = require("http");
const fs = require("fs");
const path = require("path");

require("dotenv").config();

const PORT = process.env.PORT || 3000;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;


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

      if (body.length > 30 * 1024 * 1024) {

        reject(
          new Error("업로드 용량이 너무 큽니다.")
        );

        req.destroy();
      }
    });


    req.on("end", () => {

      try {

        const data = JSON.parse(body);

        resolve(data);

      } catch (error) {

        reject(
          new Error("잘못된 JSON 데이터입니다.")
        );
      }
    });


    req.on("error", reject);
  });
}


// ======================================================
// OpenRouter 요청
// ======================================================

async function callOpenRouter(messages) {

  console.log("");
  console.log("================================");
  console.log("OpenRouter 요청");
  console.log("모델: openrouter/free");
  console.log("================================");


  const requestBody = {

    model: "openrouter/free",

    messages: messages,

    temperature: 0.7,

    max_tokens: 7000,

    // reasoning 충돌 방지를 위해 사용하지 않음
    // reasoning 옵션 없음

    stream: false
  };


  let response;


  try {

    response = await fetch(
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

        body: JSON.stringify(requestBody)
      }
    );

  } catch (error) {

    console.error("");
    console.error("================================");
    console.error("OpenRouter 연결 오류");
    console.error("================================");
    console.error(error);

    throw new Error(
      "OpenRouter 서버에 연결하지 못했습니다."
    );
  }


  const responseText =
    await response.text();


  console.log("");
  console.log("================================");
  console.log("OpenRouter 응답 상태");
  console.log(response.status);
  console.log("================================");


  if (!response.ok) {

    console.error("");
    console.error("================================");
    console.error("OpenRouter 오류");
    console.error("================================");

    console.error(
      responseText
    );

    throw new Error(
      `AI 요청 실패 (${response.status})`
    );
  }


  let result;


  try {

    result =
      JSON.parse(responseText);

  } catch (error) {

    console.error("");
    console.error("================================");
    console.error("JSON 응답 파싱 실패");
    console.error("================================");

    console.error(
      responseText
    );

    throw new Error(
      "AI 응답을 읽을 수 없습니다."
    );
  }


  console.log("");
  console.log("================================");
  console.log("OpenRouter 실제 응답 확인");
  console.log("================================");

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  console.log("================================");


  // ====================================================
  // 정상적인 content 찾기
  // ====================================================

  let text = "";


  const message =
    result?.choices?.[0]?.message;


  if (
    message &&
    typeof message.content === "string"
  ) {

    text =
      message.content;
  }


  // 혹시 content가 배열인 경우
  if (
    Array.isArray(
      message?.content
    )
  ) {

    text =
      message.content
        .map((item) => {

          if (
            typeof item === "string"
          ) {

            return item;
          }


          if (
            item &&
            typeof item.text === "string"
          ) {

            return item.text;
          }


          return "";
        })
        .join("");
  }


  // 구형 응답 형식
  if (
    !text &&
    typeof result?.choices?.[0]?.text === "string"
  ) {

    text =
      result.choices[0].text;
  }


  text =
    String(text || "").trim();


  // ====================================================
  // AI가 reasoning만 반환한 경우
  // ====================================================

  if (!text) {

    console.error("");
    console.error("================================");
    console.error("AI 응답에 글 내용이 없습니다.");
    console.error("================================");

    console.error(
      "응답 전체:"
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
    String(blogText || "");


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


  // 매장정보 앞까지만 자르는 기존 방식 제거
  // 최종 후기까지 본문에 포함하기 위해
  // 제목만 제외한다.


  const lines =
    body.split("\n");


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

function buildPrompt(data) {

  const storeName =
    data.storeName || "정보 없음";

  const location =
    data.location || "정보 없음";

  const visitDate =
    data.visitDate || "정보 없음";

  const menu =
    data.menu || "정보 없음";

  const memo =
    data.memo || "정보 없음";

  const keywords =
    data.keywords || "정보 없음";

  const titleKeyword =
    data.titleKeyword || "정보 없음";

  const experience =
    data.experience || "정보 없음";

  const provided =
    data.provided || "정보 없음";

  const disclosure =
    data.disclosure || "정보 없음";


  return `

너는 네이버 맛집 블로그 작가
"잔망차차"다.

사용자가 직접 방문해서 작성한 것처럼
자연스럽고 친근한 블로그 글을 작성한다.


==================================================
가장 중요한 규칙
==================================================

사용자가 입력한 정보와
사진에서 명확하게 확인되는 정보만 사용한다.

절대로 사실을 만들어내지 않는다.


다음 정보를 임의로 만들면 안 된다.

없는 메뉴
없는 가격
없는 재료
없는 맛
없는 식감
없는 양
없는 시설
없는 주차
없는 웨이팅
없는 직원 이야기
없는 서비스
없는 동행인
없는 방문 목적
없는 이벤트
없는 할인
없는 영업시간


확실하지 않은 정보는
반드시 "정보 없음"으로 처리한다.


==================================================
잔망차차 말투
==================================================

딱딱한 AI 문체를 사용하지 않는다.

네이버 맛집 블로그처럼
자연스럽고 편안하게 작성한다.

다음과 같은 표현을 자연스럽게 섞는다.

~더라고요
~했답니다
~좋았어요
~괜찮았어요
~마음에 들었어요
~인상적이었어요
ㅎㅎ
ㅋㅋ
😊
💕
💖
🥰
😋


하지만 같은 표현을 반복하지 않는다.

과장된 광고 문구를 사용하지 않는다.


==================================================
제목
==================================================

검색 키워드를 자연스럽게 포함한다.

너무 광고처럼 쓰지 않는다.

제목 하나만 작성한다.


==================================================
시작
==================================================

반드시

"안녕하세요 잔망차차에요! 😊"

느낌으로 시작한다.

사용자가 제공하지 않은
동행인이나 방문 목적은 절대로 만들지 않는다.


==================================================
본문 분량
==================================================

본문은 반드시 1,800자 이상 작성한다.

가능하면 2,000~2,500자 정도로 작성한다.

같은 내용을 반복해서
억지로 글자 수를 늘리지 않는다.


==================================================
글 구조
==================================================

반드시 다음 순서를 지킨다.


1. 제목

2. 인사 + 자연스러운 도입

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


==================================================
메뉴 후기
==================================================

사용자가 입력한 메뉴만 작성한다.

메뉴 이름이 없으면
메뉴 이름을 만들지 않는다.

맛이나 재료가 확실하지 않으면
추측하지 않는다.

사진에서 확실하게 확인되는 경우에만
사진 정보를 활용한다.


==================================================
방문 꿀팁
==================================================

사용자가 제공한 확실한 정보만 사용한다.

정보가 없다면
억지로 꿀팁을 만들지 않는다.

필요한 경우

"방문 전 매장에 확인해보시는 것을 추천해요."

정도로 자연스럽게 표현한다.


==================================================
한줄평
==================================================

짧고 자연스럽게 작성한다.


==================================================
좋았던 점
==================================================

본문에서 실제로 언급한 내용만
3~5개 정리한다.


==================================================
매장정보
==================================================

반드시 다음 형식을 사용한다.


📍 매장정보

🏠 매장명 :
📍 위치 :
🚗 편의시설 :
🅿️ 주차정보 :


정보가 없으면 반드시

정보 없음

이라고 작성한다.


방문일
가격
메뉴

는 매장정보에 넣지 않는다.


==================================================
최종 후기
==================================================

매장정보 바로 다음에 작성한다.

최소 2~3개의 자연스러운 문단으로 작성한다.

앞에서 작성한 내용을
단순히 복사하지 않는다.

전체적인 방문 느낌과
실제로 좋았던 부분을 자연스럽게 정리한다.


==================================================
마지막 인사
==================================================

최종 후기 다음에

잔망차차 스타일의 따뜻한 마무리를
3~5줄 작성한다.


==================================================
해시태그
==================================================

마지막 줄에
관련 해시태그 10~15개를 작성한다.


==================================================
중요
==================================================

설명하지 않는다.

"제가 작성한 글입니다"
"요청하신 글입니다"
같은 말을 하지 않는다.

AI의 생각이나 추론을 출력하지 않는다.

분석하지 않는다.

메모를 설명하지 않는다.

URL을 작성하지 않는다.

출처를 작성하지 않는다.

오직 완성된 블로그 글만 출력한다.


==================================================
사용자 입력 정보
==================================================

매장명:
${storeName}

위치:
${location}

방문일:
${visitDate}

메뉴:
${menu}

메모:
${memo}

키워드:
${keywords}

제목 키워드:
${titleKeyword}

말투:
잔망차차 스타일

경험:
${experience}

제공 정보:
${provided}

협찬/고지:
${disclosure}


==================================================
최종 요청
==================================================

위의 정보만 사용해서
완성된 네이버 맛집 블로그 글을 작성한다.

없는 사실을 절대 만들지 않는다.

반드시 1,800자 이상의 본문을 작성한다.

제목부터 해시태그까지
완성된 글 전체를 출력한다.

`;
}


// ======================================================
// 이미지 처리
// ======================================================

function createMessages(
  prompt,
  images
) {

  const validImages =
    Array.isArray(images)
      ? images.filter(
          (image) =>
            typeof image === "string" &&
            image.trim()
        )
      : [];


  // 이미지가 없는 경우
  if (
    validImages.length === 0
  ) {

    return [
      {
        role: "user",
        content: prompt
      }
    ];
  }


  // 이미지가 있는 경우
  const content = [

    {
      type: "text",
      text: prompt
    }

  ];


  // 최대 5장만 전송
  validImages
    .slice(0, 5)
    .forEach((image) => {

      content.push({

        type: "image_url",

        image_url: {
          url: image
        }

      });
    });


  return [
    {
      role: "user",
      content
    }
  ];
}


// ======================================================
// 블로그 생성
// ======================================================

async function generateBlogPost(data) {

  console.log("");
  console.log("================================");
  console.log("AI 블로그 글 생성 시작");
  console.log("================================");


  console.log(
    "매장명:",
    data.storeName || "정보 없음"
  );


  const images =
    Array.isArray(data.images)
      ? data.images
      : [];


  console.log(
    "사진 개수:",
    images.length
  );


  const prompt =
    buildPrompt(data);


  const messages =
    createMessages(
      prompt,
      images
    );


  let text =
    await callOpenRouter(
      messages
    );


  text =
    text.trim();


  let bodyLength =
    extractBodyOnly(
      text
    ).length;


  console.log("");
  console.log(
    "1차 본문 글자 수:",
    bodyLength
  );


  // ====================================================
  // 글자가 부족하면 1회만 보완
  // ====================================================

  if (
    bodyLength < 1800
  ) {

    console.log("");
    console.log(
      "본문이 1800자보다 짧아 보완합니다."
    );


    const expandPrompt = `

아래 네이버 맛집 블로그 글을
잔망차차 스타일로 다시 작성한다.

반드시 본문 1,800자 이상 작성한다.

가능하면 2,000~2,500자로 작성한다.


중요:

기존 글에 없는 사실을 절대 추가하지 않는다.

없는 메뉴를 만들지 않는다.
없는 가격을 만들지 않는다.
없는 재료를 만들지 않는다.
없는 맛을 만들지 않는다.
없는 식감을 만들지 않는다.
없는 시설을 만들지 않는다.
없는 주차정보를 만들지 않는다.
없는 웨이팅을 만들지 않는다.
없는 동행인을 만들지 않는다.
없는 서비스를 만들지 않는다.


기존 글의 사실은 유지한다.

부족한 분량은
이미 언급된 분위기,
메뉴 구성,
실제 방문 느낌,
좋았던 점,
전체적인 후기 등을
자연스럽게 확장해서 작성한다.


제목부터 해시태그까지
전체 글을 다시 출력한다.


설명이나 분석은 하지 않는다.

AI의 생각을 출력하지 않는다.

완성된 블로그 글만 출력한다.


현재 글
================================

${text}

================================

현재 본문 글자 수:

${bodyLength}

================================

`;


    const expandMessages =
      createMessages(
        expandPrompt,
        images
      );


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

      bodyLength =
        extractBodyOnly(
          text
        ).length;


      console.log(
        "보완 후 본문 글자 수:",
        bodyLength
      );
    }
  }


  console.log("");
  console.log("================================");
  console.log("블로그 글 생성 완료");
  console.log(
    "최종 본문 글자 수:",
    bodyLength
  );
  console.log("================================");


  return text;
}


// ======================================================
// 서버
// ======================================================

const server =
  http.createServer(
    async (req, res) => {


      // ==================================================
      // 블로그 생성 API
      // ==================================================

      if (
        req.url === "/api/generate" &&
        req.method === "POST"
      ) {

        try {

          const data =
            await readRequestBody(req);


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
