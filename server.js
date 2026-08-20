async function callOpenRouter(messages) {

  console.log("");
  console.log("================================");
  console.log("OpenRouter 요청");
  console.log("모델: openrouter/free");
  console.log("================================");


  const requestBody = {

    model: "openrouter/free",

    messages,

    temperature: 0.7,

    max_tokens: 12000

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

        body:
          JSON.stringify(requestBody)

      }
    );

  } catch (error) {

    console.error(
      "OpenRouter 연결 오류:",
      error
    );

    throw new Error(
      "OpenRouter 서버에 연결하지 못했습니다."
    );

  }


  const responseText =
    await response.text();


  console.log("");
  console.log("================================");
  console.log("OpenRouter 응답");
  console.log("상태 코드:", response.status);
  console.log("================================");


  if (!response.ok) {

    console.error(responseText);

    throw new Error(
      `AI 요청 실패 (${response.status})`
    );

  }


  let result;


  try {

    result =
      JSON.parse(responseText);

  } catch (error) {

    console.error(
      "JSON 파싱 실패:"
    );

    console.error(
      responseText
    );

    throw new Error(
      "AI 응답을 읽을 수 없습니다."
    );

  }


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


  // ====================================================
  // AI 글 내용 찾기
  // ====================================================

  let text = "";


  // 1. 일반적인 content
  if (
    typeof message?.content === "string"
  ) {

    text =
      message.content;

  }


  // 2. content가 배열인 경우
  else if (
    Array.isArray(message?.content)
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
            typeof item?.text === "string"
          ) {

            return item.text;

          }

          return "";

        })
        .join("");

  }


  // 3. 예전 형식 text
  if (
    !text &&
    typeof choice?.text === "string"
  ) {

    text =
      choice.text;

  }


  // ====================================================
  // reasoning 안에 content가 있는 경우
  // ====================================================

  if (
    !text &&
    typeof message?.reasoning === "string"
  ) {

    console.log(
      "content가 없어 reasoning을 확인합니다."
    );

    const reasoning =
      message.reasoning.trim();


    /*
     * reasoning 전체를 블로그 글로 사용하지 않는다.
     *
     * reasoning 안에 실제 답변이 포함된 경우에만
     * 마지막 부분을 찾아본다.
     */


    const markers = [
      "최종 답변:",
      "최종 글:",
      "완성된 글:",
      "블로그 글:",
      "답변:"
    ];


    for (
      const marker of markers
    ) {

      const index =
        reasoning.lastIndexOf(marker);


      if (
        index !== -1
      ) {

        const possibleText =
          reasoning
            .substring(
              index + marker.length
            )
            .trim();


        if (
          possibleText.length > 100
        ) {

          text =
            possibleText;

          break;

        }

      }

    }

  }


  // ====================================================
  // 다른 응답 구조 확인
  // ====================================================

  if (
    !text &&
    typeof result?.output_text === "string"
  ) {

    text =
      result.output_text;

  }


  if (
    !text &&
    typeof result?.text === "string"
  ) {

    text =
      result.text;

  }


  // ====================================================
  // 문자열 변환
  // ====================================================

  if (
    typeof text !== "string"
  ) {

    text =
      String(text || "");

  }


  text =
    text.trim();


  // ====================================================
  // 그래도 글이 없으면
  // ====================================================

  if (!text) {

    console.error("");
    console.error("================================");
    console.error("AI 응답에 실제 글 내용이 없습니다.");
    console.error("================================");

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

    console.error(
      "응답 전체:",
      JSON.stringify(
        result,
        null,
        2
      )
    );

    console.error(
      "================================"
    );


    throw new Error(
      "AI 응답은 받았지만 글 내용이 없습니다."
    );

  }


  console.log("");
  console.log("================================");
  console.log("AI 글 생성 성공");
  console.log(
    "글자 수:",
    text.length
  );
  console.log("================================");
  console.log("");


  return text;

}
