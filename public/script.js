const photoInput = document.getElementById("photoInput");
const dropZone = document.getElementById("dropZone");
const preview = document.getElementById("preview");
const photoCount = document.getElementById("photoCount");

const generateButton = document.getElementById("generateButton");
const resultCard = document.getElementById("resultCard");
const result = document.getElementById("result");

const loading = document.getElementById("loading");
const copyButton = document.getElementById("copyButton");

const experienceInfo =
  document.getElementById("experienceInfo");

let selectedFiles = [];


// ======================================================
// 사진 선택
// ======================================================

photoInput.addEventListener("change", (event) => {

  const files =
    Array.from(event.target.files);

  addFiles(files);

  // 같은 파일을 다시 선택할 수 있도록 초기화
  photoInput.value = "";
});


// ======================================================
// 드래그 앤 드롭
// ======================================================

dropZone.addEventListener("dragover", (event) => {

  event.preventDefault();

  dropZone.classList.add("dragover");
});


dropZone.addEventListener("dragleave", () => {

  dropZone.classList.remove("dragover");
});


dropZone.addEventListener("drop", (event) => {

  event.preventDefault();

  dropZone.classList.remove("dragover");

  const files =
    Array.from(event.dataTransfer.files);

  addFiles(files);
});


// ======================================================
// 사진 추가
// ======================================================

function addFiles(files) {

  const imageFiles =
    files.filter((file) =>
      file.type.startsWith("image/")
    );


  if (imageFiles.length === 0) {

    alert("이미지 파일만 올려주세요.");

    return;
  }


  selectedFiles = [
    ...selectedFiles,
    ...imageFiles,
  ];


  renderPreview();
}


// ======================================================
// 사진 미리보기
// ======================================================

function renderPreview() {

  preview.innerHTML = "";


  selectedFiles.forEach((file, index) => {

    const reader =
      new FileReader();


    reader.onload = (event) => {

      const item =
        document.createElement("div");

      item.className =
        "preview-item";


      item.innerHTML = `

        <img
          src="${event.target.result}"
          alt="업로드 사진 ${index + 1}"
        />

        <div class="preview-number">
          ${index + 1}
        </div>

        <button
          type="button"
          class="delete-photo"
          data-index="${index}"
          title="사진 삭제"
        >
          ×
        </button>

      `;


      preview.appendChild(item);


      // 삭제 버튼
      const deleteButton =
        item.querySelector(".delete-photo");


      deleteButton.addEventListener(
        "click",
        () => {

          removePhoto(index);

        }
      );

    };


    reader.readAsDataURL(file);

  });


  updatePhotoCount();
}


// ======================================================
// 사진 삭제
// ======================================================

function removePhoto(index) {

  selectedFiles.splice(index, 1);

  renderPreview();
}


// ======================================================
// 사진 개수 표시
// ======================================================

function updatePhotoCount() {

  if (selectedFiles.length === 0) {

    photoCount.textContent =
      "아직 올린 사진이 없어요.";

    return;
  }


  photoCount.textContent =
    `현재 ${selectedFiles.length}장의 사진이 올라와 있어요.`;
}


// ======================================================
// 체험단 선택
// ======================================================

const experienceRadios =
  document.querySelectorAll(
    'input[name="experience"]'
  );


experienceRadios.forEach((radio) => {

  radio.addEventListener("change", () => {

    if (
      radio.checked &&
      radio.value === "review"
    ) {

      experienceInfo.classList.remove(
        "hidden"
      );

    } else if (
      radio.checked &&
      radio.value === "normal"
    ) {

      experienceInfo.classList.add(
        "hidden"
      );

    }

  });

});


// ======================================================
// 초안 생성
// ======================================================

generateButton.addEventListener(
  "click",
  async () => {

    const storeName =
      document
        .getElementById("storeName")
        .value
        .trim();


    const location =
      document
        .getElementById("location")
        .value
        .trim();


    const visitDate =
      document
        .getElementById("visitDate")
        .value;


    const menu =
      document
        .getElementById("menu")
        .value
        .trim();


    const memo =
      document
        .getElementById("memo")
        .value
        .trim();


    const keywords =
      document
        .getElementById("keywords")
        .value
        .trim();


    const titleKeyword =
      document
        .getElementById("titleKeyword")
        .value
        .trim();


    const tone =
      document.querySelector(
        'input[name="tone"]:checked'
      ).value;


    const experience =
      document.querySelector(
        'input[name="experience"]:checked'
      ).value;


    const provided =
      document
        .getElementById("provided")
        .value
        .trim();


    const disclosure =
      document
        .getElementById("disclosure")
        .value
        .trim();


    // ------------------------------------------
    // 기본 확인
    // ------------------------------------------

    if (!storeName) {

      alert(
        "가게 이름을 먼저 입력해주세요."
      );

      return;
    }


    if (selectedFiles.length === 0) {

      alert(
        "사진을 한 장 이상 올려주세요."
      );

      return;
    }


    // ------------------------------------------
    // 결과 화면
    // ------------------------------------------

    resultCard.classList.remove(
      "hidden"
    );


    loading.classList.remove(
      "hidden"
    );


    result.innerHTML = "";


    generateButton.disabled = true;


    try {

      // ----------------------------------------
      // 사진 Base64 변환
      // ----------------------------------------

      const images =
        await Promise.all(
          selectedFiles.map(
            fileToBase64
          )
        );


      // ----------------------------------------
      // 서버 요청
      // ----------------------------------------

      const response =
        await fetch(
          "/api/generate",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({

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

              disclosure,

              images,

            }),

          }
        );


      const data =
        await response.json();


      if (!response.ok) {

        throw new Error(
          data.error ||
          "글 생성에 실패했습니다."
        );
      }


      result.textContent =
        data.text ||
        "생성된 글이 없습니다.";


    } catch (error) {

      console.error(error);


      result.textContent =
        "오류가 발생했습니다.\n\n" +
        error.message;


    } finally {

      loading.classList.add(
        "hidden"
      );


      generateButton.disabled =
        false;
    }

  }
);


// ======================================================
// 파일 → Base64
// ======================================================

function fileToBase64(file) {

  return new Promise(
    (resolve, reject) => {

      const reader =
        new FileReader();


      reader.onload = () => {

        resolve(
          reader.result
        );

      };


      reader.onerror =
        reject;


      reader.readAsDataURL(
        file
      );

    }
  );
}


// ======================================================
// 전체 복사
// ======================================================

copyButton.addEventListener(
  "click",
  async () => {

    const text =
      result.textContent;


    if (!text) {

      return;
    }


    try {

      await navigator.clipboard
        .writeText(text);


      const originalText =
        copyButton.textContent;


      copyButton.textContent =
        "✅ 복사 완료";


      setTimeout(() => {

        copyButton.textContent =
          originalText;

      }, 1500);


    } catch (error) {

      alert(
        "복사에 실패했습니다."
      );

    }

  }
);