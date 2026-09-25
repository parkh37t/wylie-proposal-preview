(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WylieIntake = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  var MIB = 1024 * 1024;
  var COUNTRIES = ["kr", "jp", "us"];
  var PRIVATE_HOST_SUFFIXES = [
    "localhost", "local", "localdomain", "internal", "intranet", "lan", "home",
    "test", "invalid", "example", "onion", "arpa"
  ];

  function fileMetadata(file) {
    // Construct a fresh allowlist. Never copy paths, content, text(), or custom fields.
    return {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified === undefined ? null : file.lastModified,
      type: file.type === undefined ? "" : file.type
    };
  }

  function validateFile(file, role) {
    var fail = function (message) { return { ok: false, error: message }; };
    if (role !== "rfp" && role !== "meeting") return fail("지원하지 않는 파일 역할입니다.");
    if (!file || typeof file !== "object") return fail("파일을 선택해 주세요.");
    if (typeof file.name !== "string" || !file.name.trim()) return fail("파일 이름이 필요합니다.");
    if (file.name.length > 255 || /[\\/:\u0000-\u001f\u007f]/.test(file.name)) {
      return fail("경로나 제어 문자가 없는 파일 이름을 사용해 주세요.");
    }
    if (!Number.isSafeInteger(file.size) || file.size <= 0) return fail("비어 있지 않은 파일을 선택해 주세요.");
    var maximum = role === "rfp" ? 25 * MIB : 10 * MIB;
    if (file.size > maximum) return fail(role === "rfp" ? "RFP는 25 MiB 이하여야 합니다." : "회의 파일은 각각 10 MiB 이하여야 합니다.");
    var dot = file.name.lastIndexOf(".");
    var extension = dot > 0 ? file.name.slice(dot).toLowerCase() : "";
    var accepted = role === "rfp" ? [".docx"] : [".docx", ".txt", ".md"];
    if (accepted.indexOf(extension) < 0) return fail(role === "rfp" ? "RFP는 DOCX 파일만 사용할 수 있습니다." : "회의 파일은 DOCX, TXT, MD만 사용할 수 있습니다.");
    if (file.lastModified !== undefined && (!Number.isSafeInteger(file.lastModified) || file.lastModified < 0)) {
      return fail("파일 수정 시각의 형식이 올바르지 않습니다.");
    }
    if (file.type !== undefined && typeof file.type !== "string") return fail("파일 형식 정보가 올바르지 않습니다.");
    return { ok: true, error: null };
  }

  function isPublicIPv4(host) {
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
    var parts = host.split(".").map(Number);
    if (parts.some(function (part) { return part < 0 || part > 255; })) return false;
    var a = parts[0], b = parts[1], c = parts[2];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }

  function ipv6Words(host) {
    var value = host.replace(/^\[|\]$/g, "");
    if (!/^[0-9a-f:]+$/i.test(value)) return null;
    var halves = value.split("::");
    if (halves.length > 2) return null;
    var left = halves[0] ? halves[0].split(":") : [];
    var right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
    var words;
    if (halves.length === 1) {
      if (left.length !== 8) return null;
      words = left;
    } else {
      if (left.length + right.length >= 8) return null;
      words = left.concat(new Array(8 - left.length - right.length).fill("0"), right);
    }
    if (words.some(function (word) { return !/^[0-9a-f]{1,4}$/i.test(word); })) return null;
    return words.map(function (word) { return parseInt(word, 16); });
  }

  function isPublicIPv6(host) {
    var words = ipv6Words(host);
    if (!words) return false;
    // Conservative global-unicast allowlist. Reject mapped/translation addresses,
    // local, multicast, transition, benchmarking and documentation ranges.
    if ((words[0] & 0xe000) !== 0x2000) return false;
    if (words[0] === 0x2002) return false;
    if (words[0] === 0x2001 && (words[1] === 0 || words[1] === 2 || words[1] === 0x0db8 || (words[1] & 0xfff0) === 0x0010 || (words[1] & 0xfff0) === 0x0020)) return false;
    if (words[0] === 0x3fff && (words[1] & 0xf000) === 0) return false;
    return true;
  }

  function publicHostSyntax(hostname) {
    var host = hostname.toLowerCase().replace(/\.$/, "");
    if (!host || host.length > 253) return false;
    if (host.charAt(0) === "[") return isPublicIPv6(host);
    if (/^[0-9.]+$/.test(host)) return isPublicIPv4(host);
    if (PRIVATE_HOST_SUFFIXES.some(function (suffix) { return host === suffix || host.endsWith("." + suffix); })) return false;
    var labels = host.split(".");
    if (labels.length < 2 || labels.some(function (label) { return !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label); })) return false;
    return /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(labels[labels.length - 1]);
  }

  function parseServiceUrl(raw) {
    var fail = function (message) { return { ok: false, url: null, kind: null, error: message }; };
    if (typeof raw !== "string" || !raw.trim()) return fail("HTTP 또는 HTTPS 주소를 입력해 주세요.");
    var value = raw.trim();
    if (Array.from(value).length > 2048) return fail("서비스 주소는 2,048자 이내로 입력해 주세요.");
    if (!/^https?:\/\//i.test(value) || /[\u0000-\u0020\u007f\\]/.test(value)) return fail("공백 없이 http:// 또는 https://로 시작하는 주소를 입력해 주세요.");
    var parsed;
    try { parsed = new URL(value); } catch (_) { return fail("주소 형식이 올바르지 않습니다."); }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return fail("HTTP 또는 HTTPS 주소만 사용할 수 있습니다.");
    var authority = value.match(/^https?:\/\/([^/?#]*)/i);
    if (parsed.username || parsed.password || (authority && authority[1].indexOf("@") >= 0)) return fail("계정이나 비밀번호가 포함된 주소는 사용할 수 없습니다.");
    if (!publicHostSyntax(parsed.hostname)) return fail("공개 인터넷 주소를 사용해 주세요. 로컬·사설·예약 주소는 사용할 수 없습니다.");
    var host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    var kind = "website";
    if (host === "play.google.com" && /^\/store\/apps(?:\/|$)/.test(parsed.pathname)) kind = "google_play";
    if (host === "apps.apple.com") kind = "apple_app_store";
    return { ok: true, url: parsed.href, kind: kind, error: null };
  }

  function normalizeInputs(inputs) {
    var raw = inputs && typeof inputs === "object" && !Array.isArray(inputs) ? inputs : {};
    var issues = [];
    function list(value, field, split) {
      if (value === undefined || value === null || value === "") return [];
      if (typeof value === "string" && split) return value.split(split);
      if (Array.isArray(value)) return value.slice();
      issues.push({ field: field, message: "입력 목록의 형식이 올바르지 않습니다." });
      return [];
    }
    var urlEntries = list(raw.urls, "urls", /\r?\n/).map(function (value, index) {
      return { value: value, originalIndex: index };
    }).filter(function (entry) { return typeof entry.value !== "string" || entry.value.trim() !== ""; });
    var keywordEntries = list(raw.keywords, "keywords", /[,，\r\n]/);
    var keywords = keywordEntries.filter(function (entry) { return typeof entry !== "string" || entry.trim() !== ""; }).map(function (entry) { return typeof entry === "string" ? entry.trim() : entry; });
    // Match the UI's complete input length, including separators and whitespace.
    // Arrays use the equivalent comma-separated input without invoking custom toString.
    var keywordInput = typeof raw.keywords === "string" ? raw.keywords : keywordEntries.map(function (entry) { return typeof entry === "string" ? entry : ""; }).join(",");
    var country = raw.country === undefined || raw.country === null || raw.country === "" ? "kr" : raw.country;
    return {
      projectName: typeof raw.projectName === "string" ? raw.projectName.trim() : "",
      rfp: raw.rfp,
      meetingFiles: list(raw.meetingFiles, "meetingFiles", null),
      meetingText: raw.meetingText === undefined || raw.meetingText === null ? "" : raw.meetingText,
      urls: urlEntries.map(function (entry) { return entry.value; }),
      urlEntries: urlEntries,
      keywords: keywords,
      keywordInputLength: Array.from(keywordInput).length,
      country: typeof country === "string" ? country.trim().toLowerCase() : country,
      issues: issues
    };
  }

  function validateInputs(inputs) {
    var data = normalizeInputs(inputs);
    var errors = data.issues.slice();
    var warnings = [];
    function error(field, message) { errors.push({ field: field, message: message }); }
    if (!data.projectName) error("projectName", "프로젝트 이름을 입력해 주세요.");
    else if (Array.from(data.projectName).length > 100 || /[\u0000-\u001f\u007f]/.test(data.projectName)) error("projectName", "프로젝트 이름은 줄바꿈 없이 100자 이내로 입력해 주세요.");
    var rfp = validateFile(data.rfp, "rfp");
    if (!rfp.ok) error("rfp", rfp.error);
    if (data.meetingFiles.length > 3) error("meetingFiles", "회의 파일은 최대 3개까지 선택할 수 있습니다.");
    var seen = new Set();
    data.meetingFiles.forEach(function (file, index) {
      var result = validateFile(file, "meeting");
      if (!result.ok) { error("meetingFiles", (index + 1) + "번 파일: " + result.error); return; }
      var identity = JSON.stringify([file.name, file.size, file.lastModified === undefined ? null : file.lastModified]);
      if (seen.has(identity)) error("meetingFiles", "이름·용량·수정 시각이 같은 회의 파일이 중복 선택되었습니다. 파일 내용의 동일 여부를 검사한 것은 아닙니다.");
      seen.add(identity);
    });
    if (typeof data.meetingText !== "string") error("meetingText", "회의 메모는 텍스트로 입력해 주세요.");
    else if (Array.from(data.meetingText).length > 20000) error("meetingText", "회의 메모는 20,000자 이내로 입력해 주세요.");
    if (data.urls.length > 5) error("urls", "서비스 주소는 최대 5개까지 등록할 수 있습니다.");
    var seenUrls = new Map();
    data.urlEntries.forEach(function (entry) {
      var parsed = parseServiceUrl(entry.value);
      var field = "urls[" + entry.originalIndex + "]";
      if (!parsed.ok) { error(field, (entry.originalIndex + 1) + "번 주소: " + parsed.error); return; }
      // URL normalizes scheme/host case, default ports, dot segments and root path.
      // A DNS trailing dot is also equivalent. Preserve query order and fragments:
      // either can identify a different service state and is not safely discardable.
      var canonical = new URL(parsed.url);
      canonical.hostname = canonical.hostname.replace(/\.$/, "");
      var identity = canonical.href;
      if (seenUrls.has(identity)) error(field, (entry.originalIndex + 1) + "번 주소는 " + (seenUrls.get(identity) + 1) + "번 주소와 같은 주소입니다.");
      else seenUrls.set(identity, entry.originalIndex);
    });
    if (data.keywords.length > 5) error("keywords", "조사 키워드는 최대 5개까지 입력할 수 있습니다.");
    if (data.keywords.some(function (keyword) { return typeof keyword !== "string"; })) error("keywords", "조사 키워드는 텍스트로 입력해 주세요.");
    if (data.keywordInputLength > 250) error("keywords", "조사 키워드는 구분자를 포함해 총 250자 이내로 입력해 주세요.");
    var seenKeywords = new Set();
    data.keywords.forEach(function (keyword) {
      if (typeof keyword !== "string") return;
      var normalized = keyword.toLowerCase();
      if (seenKeywords.has(normalized)) error("keywords", "대소문자를 구분하지 않고 같은 조사 키워드가 중복 입력되었습니다.");
      seenKeywords.add(normalized);
    });
    if (COUNTRIES.indexOf(data.country) < 0) error("country", "조사 국가는 kr, jp, us 중에서 선택해 주세요.");
    if (!data.keywords.length) warnings.push("조사 키워드가 없어 검색 데이터 조사 계획은 needs_seed 상태로 보류됩니다.");
    if (data.urls.length) warnings.push("주소 형식만 확인했습니다. 방문이나 DNS 조회는 하지 않았으며 실행 서버에서 공개 IP를 다시 확인해야 합니다.");
    if (data.meetingFiles.length || (typeof data.meetingText === "string" && data.meetingText.trim())) warnings.push("회의 자료는 확인되지 않은 고객 발언으로 분리되며 RFP 확정 요구로 자동 반영되지 않습니다.");
    warnings.push("파일의 확장자와 메타정보만 확인했습니다. 내용·체크섬·문서 구조는 아직 검사하지 않았습니다.");
    return { valid: errors.length === 0, errors: errors, warnings: warnings };
  }

  function createBrief(inputs) {
    var validation = validateInputs(inputs);
    if (!validation.valid) {
      var error = new Error("입력 확인이 필요합니다.");
      error.name = "IntakeValidationError";
      error.errors = validation.errors;
      throw error;
    }
    var data = normalizeInputs(inputs);
    var hasKeywords = data.keywords.length > 0;
    // ListeningMind requires lowercase English keywords. Keep the entered labels
    // unchanged in the brief and normalize only the planned provider queries.
    var queryKeywords = data.keywords.map(function (keyword) { return keyword.toLowerCase(); });
    function researchPlan(path, query) {
      return {
        expected_provider: "ListeningMind",
        expected_api_path: path,
        query: query,
        seed_status: hasKeywords ? "provided" : "needs_seed",
        planning_status: hasKeywords ? "ready_for_backend" : "blocked_needs_seed",
        execution_status: "awaiting_backend"
      };
    }
    var plans = [
      researchPlan("/intent_finder/keyword_list", { keywords: queryKeywords.slice(), gl: data.country, limit: 20 }),
      researchPlan("/keyword_info", { keywords: queryKeywords.slice(), gl: data.country, data_type: "ads_info" })
    ];
    // Each supplied seed gets both analyses. With no seed, keep explicit blocked
    // templates that omit the required keyword rather than inventing one.
    (hasKeywords ? queryKeywords : [null]).forEach(function (keyword) {
      var seed = keyword === null ? {} : { keyword: keyword };
      plans.push(researchPlan("/path_finder", Object.assign({}, seed, { gl: data.country, time_point: "curr", limit: 20 })));
      plans.push(researchPlan("/cluster_finder", Object.assign({}, seed, { gl: data.country, time_point: "curr", hop: 1, limit: 20, data_type: "communities", orientation: "UNDIRECTED" })));
    });
    return {
      schema_version: "0.2",
      mode: "intake_prototype",
      execution_status: "not_started",
      project: { name: data.projectName, country: data.country },
      sources: {
        metadata_only: true,
        file_contents_included: false,
        local_paths_included: false,
        content_hashes_computed: false,
        rfp: { role: "rfp", source_type: "file_metadata", file: fileMetadata(data.rfp), content_read: false, content_status: "not_uploaded", execution_status: "awaiting_backend" },
        meeting: {
          role: "customer_statement",
          confirmation_status: "unconfirmed",
          files: data.meetingFiles.map(fileMetadata),
          text: { provided: Boolean(data.meetingText.trim()), character_count: Array.from(data.meetingText).length, content_included: false },
          content_read: false,
          content_status: "not_uploaded",
          execution_status: "awaiting_backend"
        }
      },
      service_urls: data.urls.map(function (raw) {
        var parsed = parseServiceUrl(raw);
        return { url: parsed.url, kind: parsed.kind, status: "registered_not_visited", host_validation: "syntax_only_dns_not_resolved", execution_status: "awaiting_backend" };
      }),
      research: {
        expected_provider: "ListeningMind",
        keywords: data.keywords.slice(),
        country: data.country,
        planning_status: hasKeywords ? "ready_for_backend" : "blocked_needs_seed",
        execution_status: "awaiting_backend",
        plans: plans
      },
      execution: {
        upload: "awaiting_backend",
        document_analysis: "awaiting_backend",
        service_review: "awaiting_backend",
        listeningmind_research: "awaiting_backend",
        proposal_generation: "awaiting_backend"
      },
      warnings: validation.warnings.slice(),
      limitations: [
        "접수 화면의 입력 명세이며 서버 접수, 작업 생성 또는 AI 실행 결과가 아닙니다.",
        "파일 내용, 로컬 경로, 회의 메모 원문은 포함하지 않습니다. 실행 시 원본을 별도로 전달해야 합니다.",
        "파일 중복은 메타정보로만 검사했으며 내용 해시를 생성하지 않았습니다.",
        "URL의 DNS와 재지정 대상은 실행 서버가 연결 전에 다시 검증해야 합니다.",
        "expected_api_path는 ListeningMind 연동 대상입니다. 이 화면에서는 해당 API를 호출하거나 조사 결과를 생성하지 않습니다."
      ]
    };
  }

  return {
    validateFile: validateFile,
    parseServiceUrl: parseServiceUrl,
    validateInputs: validateInputs,
    createBrief: createBrief
  };
});
