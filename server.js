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

  /*
   * 기본적으로 OpenRouter 무료 자동 라우터를 사용합니다.
   *
   * openrouter/free는 현재 이용 가능한 무료 모델 중에서
   * 요청에 필요한 기능(이미지 입력 등)을 고려하여
   * 모델을 자동으로 선택합니다.
   *
   * 따라서 특정 무료 모델이 일시적으로
   * content_filter / 빈 응답 / provider 오류를 반환해도
   * 다시 요청할 수 있도록 구성합니다.
   */

  const maxAttempts = 3;

  let lastError = null;


  for (let attempt = 1; attempt <= maxAttempts; attempt++) {

    console.log("");
    console.log("================================");
    console.log("OpenRouter 요청");
    console.log(`시도: ${attempt} / ${maxAttempts}`);
    console.log("모델: openrouter/free");
    console.log("================================");


    const requestBody = {

      model: "openrouter/free",

      messages: messages,

      temperature: 0.7,

      max_tokens: 7000,

      stream: false
    };


    let response;


    // ==================================================
    // OpenRouter 연결
    // ==================================================

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

      lastError =
        new Error(
          "OpenRouter 서버에 연결하지 못했습니다."
        );

      if (attempt < maxAttempts) {

        console.log(
          "잠시 후 다시 요청합니다..."
        );

        await wait(1200);

        continue;
      }

      throw lastError;
    }


    const responseText =
      await response.text();


    console.log("");
    console.log("================================");
    console.log("OpenRouter 응답 상태");
    console.log(response.status);
    console.log("================================");


    // ==================================================
    // HTTP 오류
    // ==================================================

    if (!response.ok) {

      console.error("");
      console.error("================================");
      console.error("OpenRouter HTTP 오류");
      console.error("================================");

      console.error(responseText);


      lastError =
        new Error(
          `AI 요청 실패 (${response.status})`
        );


      if (attempt < maxAttempts) {

        console.log(
          "다시 요청합니다..."
        );

        await wait(1200);

        continue;
      }


      throw lastError;
    }


    // ==================================================
    // JSON 파싱
    // ==================================================

    let result;


    try {

      result =
        JSON.parse(responseText);

    } catch (error) {

      console.error("");
      console.error("================================");
      console.error("JSON 응답 파싱 실패");
      console.error("================================");

      console.error(responseText);


      lastError =
        new Error(
          "AI 응답을 읽을 수 없습니다."
        );


      if (attempt < maxAttempts) {

        await wait(1200);

        continue;
      }


      throw lastError;
    }


    // ==================================================
    // 응답 상태 확인
    // ==================================================

    const choice =
      result?.choices?.[0];

    const message =
      choice?.message;


    const finishReason =
      choice?.finish_reason || "";

    const nativeFinishReason =
      choice?.native_finish_reason || "";


    console.log("");
    console.log("================================");
    console.log("AI 응답 상태");
    console.log("================================");

    console.log(
      "finish_reason:",
      finishReason || "없음"
    );

    console.log(
      "native_finish_reason:",
      nativeFinishReason || "없음"
    );


    // ==================================================
    // content 추출
    // ==================================================

    let text = "";


    // 일반적인 문자열 content
    if (
      message &&
      typeof message.content === "string"
    ) {

      text =
        message.content;
    }


    // 배열 형태 content
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
      typeof choice?.text === "string"
    ) {

      text =
        choice.text;
    }


    text =
      String(text || "").trim();


    // ==================================================
    // 정상 응답
    // ==================================================

    if (text) {

      console.log("");
      console.log("================================");
      console.log("AI 글 생성 성공");
      console.log("================================");

      return text;
    }


    // ==================================================
    // 빈 응답
    // ==================================================

    console.error("");
    console.error("================================");
    console.error("AI content가 비어 있습니다.");
    console.error("================================");


    if (
      finishReason === "content_filter" ||
      nativeFinishReason === "content_filter"
    ) {

      console.error(
        "content_filter가 발생했습니다."
      );
    }


    if (
      message?.reasoning
    ) {

      console.error(
        "reasoning은 존재하지만 최종 content가 없습니다."
      );
    }


    lastError =
      new Error(
        "AI 응답에 글 내용이 없습니다."
      );


    // ==================================================
    // 다음 시도
    // ==================================================

    if (attempt < maxAttempts) {

      console.log("");
      console.log(
        "================================"
      );

      console.log(
        "AI 응답이 정상적이지 않습니다."
      );

      console.log(
        "잠시 후 다시 생성합니다."
      );

      console.log(
        "================================"
      );


      await wait(1200);

      continue;
    }
  }


  throw (
    lastError ||
    new Error(
      "AI 글 생성에 실패했습니다."
    )
  );
}


// ======================================================
// 재시도 대기
// ======================================================

function wait(ms) {

  return new Promise(
    (resolve) => {
      setTimeout(resolve, ms);
    }
  );
}


// ======================================================
// 본문 글자 수 계산
// ======================================================

function extractBodyOnly(blogText) {

  let body =
    String(blogText || "");


  // 해시태그 제거
  const hashtagIndex =
    body.lastIndexOf("#");


  if (
    hashtagIndex !== -1
  ) {

    const afterHashtag =
      body.substring(
        hashtagIndex
      );

    // 마지막 부분이 해시태그 줄인 경우만 제거
    if (
      afterHashtag.includes("#")
    ) {

      body =
        body.substring(
          0,
          hashtagIndex
        );
    }
  }


  // 제목 제거
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

사용자가 직접 작성한 것처럼
자연스럽고 친근한 네이버 맛집 블로그 글을 작성한다.


==================================================
절대 규칙
==================================================

가장 중요한 규칙이다.

사용자가 입력한 정보와
사진에서 명확하게 확인되는 정보만 사용한다.

절대로 사실을 만들어내지 않는다.


다음 내용을 임의로 만들지 않는다.

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
"정보 없음"으로 처리한다.


사진에서 확인할 수 있는 내용도
명확하게 확인되는 범위에서만 사용한다.

사진으로 추측해야 하는 정보는
사실처럼 단정하지 않는다.


==================================================
잔망차차 스타일
==================================================

딱딱한 AI 문체를 사용하지 않는다.

네이버 맛집 블로그처럼
자연스럽고 편안하게 작성한다.

잔망차차 특유의
살짝 귀엽고 친근한 말투를 사용한다.

예:

~더라고요
~했답니다
~좋았어요
~괜찮았어요
~마음에 들었어요
~인상적이었어요
~싶더라고요
ㅎㅎ
ㅋㅋ
😊
💕
💖
🥰
😋
✨

이런 표현을 자연스럽게 섞는다.

같은 표현을 반복하지 않는다.

과도한 광고 문구를 사용하지 않는다.

"무조건 방문하세요"
"인생 맛집"
"역대급"
같은 과장 표현은
사용자 정보에 그런 표현이 있을 때만 사용한다.


==================================================
제목
==================================================

검색 키워드를 자연스럽게 포함한다.

제목은 하나만 작성한다.

사용자가 제공한 제목 키워드를
가능하면 자연스럽게 활용한다.


==================================================
첫 문장
==================================================

반드시 다음 느낌으로 시작한다.

안녕하세요 잔망차차에요! 😊


단,

사용자가 제공하지 않은
동행인을 만들지 않는다.

사용자가 제공하지 않은
방문 목적을 만들지 않는다.


==================================================
본문 분량
==================================================

본문은 반드시 1,800자 이상 작성한다.

가능하면 2,000~2,500자 정도를 목표로 한다.

글자 수를 늘리기 위해
같은 문장을 반복하지 않는다.


==================================================
글 전체 구조
==================================================

반드시 다음 순서를 따른다.


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

메뉴 이름을 임의로 만들지 않는다.

사용자가 제공한 맛 표현이 있으면
그 표현을 자연스럽게 활용한다.

맛이 제공되지 않았다면
맛을 상상해서 작성하지 않는다.

재료도 마찬가지다.

사진에서 확실하게 확인되는 경우에만
사진 정보를 활용한다.


==================================================
식전 음식 / 음료
==================================================

사용자가 제공한 경우에만 작성한다.

사진에서 명확하게 확인되는 경우에도
확인 가능한 범위만 작성한다.

사진만 보고
정확한 재료나 맛을 추측하지 않는다.


==================================================
방문 꿀팁
==================================================

사용자가 제공한 확실한 정보만 사용한다.

정보가 없다면
억지로 꿀팁을 만들지 않는다.

필요하다면

"방문 전 매장에 확인해보시는 것을 추천해요."

정도로 자연스럽게 작성한다.


==================================================
한줄평
==================================================

짧고 자연스럽게 작성한다.

본문에서 실제로 확인된 내용만 사용한다.


==================================================
좋았던 점
==================================================

본문에서 실제로 언급한 내용만
3~5개 정리한다.

새로운 장점을 추가하지 않는다.


==================================================
매장정보
==================================================

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
가격
메뉴

는 매장정보에 넣지 않는다.


==================================================
최종 후기
==================================================

매장정보 바로 다음에 작성한다.

최소 2~3개의 자연스러운 문단으로 작성한다.

앞의 내용을 그대로 복사하지 않는다.

전체적인 방문 느낌을 자연스럽게 정리한다.

실제로 좋았던 부분을 중심으로
따뜻하게 마무리한다.


==================================================
마지막 인사
==================================================

최종 후기 다음에는

잔망차차 스타일의
따뜻한 마지막 인사를 작성한다.

3~5줄 정도 작성한다.


==================================================
해시태그
==================================================

마지막에는
관련 해시태그 10~15개를 작성한다.

본문에 없는 지역이나 메뉴를
해시태그로 만들지 않는다.


==================================================
출력 금지
==================================================

아주 중요하다.

최종 답변에는
완성된 블로그 글만 출력한다.

다음 내용은 절대 출력하지 않는다.

Thinking Process
분석 과정
추론 과정
메모 설명
프롬프트 설명
작성 과정
AI 응답 설명
출처
URL
코드
JSON
"제가 작성한 글입니다"
"요청하신 글입니다"


오직

제목
본문
매장정보
최종 후기
마지막 인사
해시태그

만 출력한다.


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

위의 사용자 정보와
사진에서 명확하게 확인되는 정보만 사용해서

완성된 네이버 맛집 블로그 글을 작성한다.

없는 사실을 절대 만들지 않는다.

본문은 반드시 1,800자 이상 작성한다.

가능하면 2,000~2,500자를 목표로 한다.

제목부터 해시태그까지
완성된 글 전체를 출력한다.

다시 한 번 강조한다.

AI의 생각을 출력하지 않는다.

분석을 출력하지 않는다.

설명을 출력하지 않는다.

완성된 블로그 글만 출력한다.

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


  // 이미지 없음
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


  // 이미지 있음
  const content = [

    {
      type: "text",
      text: prompt
    }

  ];


  // 최대 5장
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


  // ==================================================
  // 1차 생성
  // ==================================================

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


  // ==================================================
  // 본문이 짧으면 1회 보완
  // ==================================================

  if (
    bodyLength < 1800
  ) {

    console.log("");
    console.log(
      "본문이 1800자보다 짧습니다."
    );

    console.log(
      "보완 글을 생성합니다."
    );


    const expandPrompt = `

아래 글을 네이버 맛집 블로그
"잔망차차" 스타일로 다시 작성한다.

본문은 반드시 1,800자 이상 작성한다.

가능하면 2,000~2,500자 정도로 작성한다.


중요한 규칙:

기존 글에 없는 사실을 절대 추가하지 않는다.

없는 메뉴를 만들지 않는다.
없는 가격을 만들지 않는다.
없는 재료를 만들지 않는다.
없는 맛을 만들지 않는다.
없는 식감을 만들지 않는다.
없는 양을 만들지 않는다.
없는 시설을 만들지 않는다.
없는 주차정보를 만들지 않는다.
없는 웨이팅을 만들지 않는다.
없는 직원을 만들지 않는다.
없는 서비스를 만들지 않는다.
없는 동행인을 만들지 않는다.
없는 방문 목적을 만들지 않는다.
없는 이벤트를 만들지 않는다.
없는 할인을 만들지 않는다.
없는 영업시간을 만들지 않는다.


기존 글의 사실은 유지한다.

부족한 분량은
이미 언급된 내용의 분위기,
메뉴 구성,
사진에서 확인되는 내용,
좋았던 점,
전체적인 방문 느낌을
자연스럽게 확장해서 작성한다.


제목부터 해시태그까지
전체 글을 다시 출력한다.

최종 답변에는
완성된 블로그 글만 출력한다.

분석하지 않는다.

Thinking Process를 출력하지 않는다.

메모를 설명하지 않는다.

URL을 출력하지 않는다.

출처를 출력하지 않는다.


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


    try {

      const expandedText =
        await callOpenRouter(
          expandMessages
        );


      if (
        expandedText &&
        expandedText.trim()
      ) {

        const expandedBodyLength =
          extractBodyOnly(
            expandedText
          ).length;


        // 보완 글이 실제로 더 길 때만 사용
        if (
          expandedBodyLength >= bodyLength
        ) {

          text =
            expandedText.trim();

          bodyLength =
            expandedBodyLength;


          console.log(
            "보완 후 본문 글자 수:",
            bodyLength
          );

        } else {

          console.log(
            "보완 글이 기존 글보다 짧아서 기존 글을 유지합니다."
          );
        }

      }

    } catch (error) {

      console.error("");
      console.error(
        "보완 생성에 실패했습니다."
      );

      console.error(
        error.message
      );

      // 1차 글이 이미 있으면
      // 1차 글을 그대로 사용
    }
  }


  // ==================================================
  // 최종 결과 확인
  // ==================================================

  if (
    !text ||
    !text.trim()
  ) {

    throw new Error(
      "AI가 완성된 글을 반환하지 않았습니다."
    );
  }


  console.log("");
  console.log("================================");
  console.log("블로그 글 생성 완료");
  console.log(
    "최종 본문 글자 수:",
    bodyLength
  );
  console.log("================================");


  return text.trim();
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
