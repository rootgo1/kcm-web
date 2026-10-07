// @ts-nocheck -- Preserved upstream JavaScript policy; API inputs/DB projections are validated by effective-price.mjs.
// Prepared quotation policy copied from KCM n8n Price Calculation (2026-10-07).
// These are the team's demonstration assumptions; no live carrier-policy lookup is performed.
// 고객 조회와 선납금 없이 순수 체감가를 계산합니다.
// bundles/bundle_rules에서 선택한 결합의 "모바일 할인분"만 월 납부금에 반영합니다.

const KT_INSTALLMENT_ANNUAL_RATE = 0.059;
const DEVICE_DISCOUNT_POLICY_EFFECTIVE_DATE = '2026-10-01';
const DEVICE_DISCOUNT_POLICY_PLAN_MONTHLY_FEE = 90000;
const DEVICE_DISCOUNT_POLICY_CONTRACT_MONTHS = 24;
const SUPPORTED_INSTALLMENT_MONTHS = [1, 24];
const KT_BUNDLE_POLICY_EFFECTIVE_DATE = '2026-10-01';
const KT_PREMIUM_MOBILE_FEE_MIN = 77000;
const KT_PREMIUM_YOUTH_MOBILE_FEE_MIN = 80000;
const KT_BUNDLE_MAX_MOBILE_LINES = 10;

// 팀이 등록한 시연용 단말 할인표: 초이스90 / 24개월 기준
// common: 공통지원금, additional: KT 다이렉트샵 추가지원금
const DEVICE_DISCOUNT_POLICIES = [
  {
    code: 'GALAXY_S26_FE',
    label: 'Galaxy S26 FE',
    category: 'GALAXY',
    tokens: ['s26fe'],
    common: 500000,
    additional: 75000,
  },
  {
    code: 'GALAXY_S26_ULTRA',
    label: 'Galaxy S26 Ultra',
    category: 'GALAXY',
    tokens: ['s26ultra'],
    common: 600000,
    additional: 90000,
  },
  {
    code: 'GALAXY_S26_PLUS',
    label: 'Galaxy S26+',
    category: 'GALAXY',
    tokens: ['s26plus'],
    common: 600000,
    additional: 90000,
  },
  {
    code: 'GALAXY_S26',
    label: 'Galaxy S26',
    category: 'GALAXY',
    tokens: ['s26'],
    common: 600000,
    additional: 90000,
  },
  {
    code: 'GALAXY_Z_FLIP8',
    label: 'Galaxy Z Flip8',
    category: 'GALAXY',
    tokens: ['zflip8', 'flip8'],
    common: 500000,
    additional: 75000,
  },
  {
    code: 'GALAXY_Z_FOLD8',
    label: 'Galaxy Z Fold8',
    category: 'GALAXY',
    tokens: ['zfold8', 'fold8'],
    common: 500000,
    additional: 75000,
  },
  {
    code: 'IPHONE_18_PRO_MAX',
    label: 'iPhone 18 Pro Max',
    category: 'IPHONE',
    tokens: ['iphone18promax'],
    common: 150000,
    additional: 22500,
  },
  {
    code: 'IPHONE_18_PRO',
    label: 'iPhone 18 Pro',
    category: 'IPHONE',
    tokens: ['iphone18pro'],
    common: 400000,
    additional: 60000,
  },
];

function hasValue(value) {
  return value !== undefined && value !== null && value !== '';
}

function numberValue(value, fieldName) {
  const parsed = Number(String(value).replace(/,/g, '').trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} 값이 숫자가 아닙니다: ${value}`);
  }
  return parsed;
}

function nonNegative(value, fieldName, defaultValue = 0) {
  const parsed = hasValue(value)
    ? numberValue(value, fieldName)
    : defaultValue;

  if (parsed < 0) {
    throw new Error(`${fieldName} 값은 0 이상이어야 합니다.`);
  }
  return parsed;
}

function requiredPositiveInteger(value, fieldName) {
  if (!hasValue(value)) {
    throw new Error(`${fieldName} 값이 필요합니다.`);
  }

  const parsed = numberValue(value, fieldName);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${fieldName} 값은 1 이상의 정수여야 합니다.`);
  }
  return parsed;
}

function normalizeDiscountType(value) {
  if (!hasValue(value)) {
    throw new Error('discount_type 값이 필요합니다.');
  }

  const normalized = String(value).trim().toUpperCase();
  if (['PLAN_DISCOUNT', '요금할인', '선택약정'].includes(normalized)) {
    return 'PLAN_DISCOUNT';
  }
  if (['DEVICE_DISCOUNT', '단말할인', '기기할인'].includes(normalized)) {
    return 'DEVICE_DISCOUNT';
  }

  throw new Error(
    'discount_type은 PLAN_DISCOUNT(요금할인) 또는 DEVICE_DISCOUNT(단말할인)여야 합니다.',
  );
}

function booleanValue(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined) {
    return false;
  }

  return ['true', '1', 'yes', 'y', '예', '사용', '적용'].includes(
    String(value).trim().toLowerCase(),
  );
}

function enumToken(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function normalizeHouseholdBundleType(value) {
  if (!hasValue(value)) return 'NONE';

  const normalized = enumToken(value);
  if (['NONE', 'NO_BUNDLE', '없음', '미적용'].includes(normalized)) {
    return 'NONE';
  }
  if (
    [
      'LIVING_APART_FAMILY',
      'SEPARATE_HOUSEHOLD_FAMILY',
      '따로_살아도_가족결합',
      '따로살아도가족결합',
    ].includes(normalized)
  ) {
    return 'LIVING_APART_FAMILY';
  }

  throw new Error(
    'household_bundle_type은 NONE 또는 LIVING_APART_FAMILY여야 합니다.',
  );
}

function normalizeMobileBundleType(value) {
  if (!hasValue(value)) return 'NONE';

  const normalized = enumToken(value);
  if (['NONE', 'NO_BUNDLE', '없음', '미적용'].includes(normalized)) {
    return 'NONE';
  }
  if (
    ['FIXED', 'FIXED_AMOUNT', '정액', '정액결합', '정액결합할인'].includes(
      normalized,
    )
  ) {
    return 'FIXED';
  }
  if (
    ['TOTAL', 'TOTAL_AMOUNT', '총액', '총액결합', '총액결합할인'].includes(
      normalized,
    )
  ) {
    return 'TOTAL';
  }
  if (
    [
      'PREMIUM_FAMILY',
      '프리미엄_가족결합',
      '프리미엄가족결합',
    ].includes(normalized)
  ) {
    return 'PREMIUM_FAMILY';
  }
  if (
    [
      'PREMIUM_SINGLE',
      '프리미엄_싱글결합',
      '프리미엄싱글결합',
    ].includes(normalized)
  ) {
    return 'PREMIUM_SINGLE';
  }

  throw new Error(
    'mobile_bundle_type은 NONE, FIXED, TOTAL, PREMIUM_FAMILY, PREMIUM_SINGLE 중 하나여야 합니다.',
  );
}

function normalizeInternetTier(value, internetSpeedMbps) {
  if (hasValue(value)) {
    const normalized = enumToken(value);
    let tier = null;
    if (['NONE', 'NO_INTERNET', '없음', '미가입'].includes(normalized)) {
      tier = 'NONE';
    }
    if (!tier &&
      [
        'SLIM',
        'SLIM_PLUS',
        'LOW',
        '100M',
        '인터넷_슬림',
        '인터넷슬림',
      ].includes(normalized)
    ) {
      tier = 'SLIM';
    }
    if (!tier &&
      [
        'BASIC_PLUS',
        'BASIC_OR_HIGHER',
        'BASIC',
        'ESSENCE',
        'PREMIUM',
        '500M',
        '1G',
        '기가',
        '베이직_이상',
        '베이직이상',
      ].includes(normalized)
    ) {
      tier = 'BASIC_PLUS';
    }

    if (!tier) {
      throw new Error(
        'internet_tier는 NONE, SLIM, BASIC_PLUS 중 하나여야 합니다.',
      );
    }

    if (hasValue(internetSpeedMbps)) {
      const speed = nonNegative(internetSpeedMbps, 'internet_speed_mbps');
      const speedTier = speed === 0 ? 'NONE' : speed >= 500 ? 'BASIC_PLUS' : 'SLIM';
      if (tier !== speedTier) {
        throw new Error(
          `internet_tier(${tier})와 internet_speed_mbps(${speed})가 서로 맞지 않습니다. 500Mbps 이상은 BASIC_PLUS, 1~499Mbps는 SLIM, 0은 NONE입니다.`,
        );
      }
    }

    return tier;
  }

  if (!hasValue(internetSpeedMbps)) return 'NONE';

  const speed = nonNegative(internetSpeedMbps, 'internet_speed_mbps');
  if (speed === 0) return 'NONE';
  return speed >= 500 ? 'BASIC_PLUS' : 'SLIM';
}

function normalizeInternetProductType(value) {
  if (!hasValue(value)) {
    throw new Error(
      '결합할인에는 internet_product_type 값이 필요합니다.',
    );
  }

  const normalized = enumToken(value);
  if (['STANDARD', '일반', '일반_인터넷'].includes(normalized)) {
    return 'STANDARD';
  }
  if (
    [
      'SINGLE_INTERNET_BASIC',
      '싱글_인터넷_베이직',
      '싱글인터넷베이직',
    ].includes(normalized)
  ) {
    return 'SINGLE_INTERNET_BASIC';
  }
  if (
    ['FAMILY_SUBLINE', '패밀리_자회선', '패밀리자회선'].includes(
      normalized,
    )
  ) {
    return 'FAMILY_SUBLINE';
  }

  throw new Error(
    'internet_product_type은 STANDARD, SINGLE_INTERNET_BASIC, FAMILY_SUBLINE 중 하나여야 합니다.',
  );
}

function internetContractDiscountFactor(value) {
  if (!hasValue(value)) {
    throw new Error(
      '결합할인에는 휴대폰 contract_months와 별도로 internet_contract_months가 필요합니다.',
    );
  }

  const months = requiredPositiveInteger(value, 'internet_contract_months');
  if (months === 36) return { months, factor: 1 };
  if (months === 24) return { months, factor: 0.5 };
  if (months === 12) return { months, factor: 0.25 };

  throw new Error('internet_contract_months는 12, 24, 36 중 하나여야 합니다.');
}

function normalizeAllocationMethod(value) {
  if (!hasValue(value)) {
    throw new Error(
      '총액결합에는 bundle_allocation_method 값이 필요합니다.',
    );
  }

  const normalized = enumToken(value);
  if (['EQUAL', '1/N', '동일', '균등'].includes(normalized)) return 'EQUAL';
  if (
    ['PROPORTIONAL', 'CONTRIBUTION', '기여도', '비례'].includes(normalized)
  ) {
    return 'PROPORTIONAL';
  }
  if (
    ['DESIGNATED', 'ONE_LINE', '지정회선', '몰아주기'].includes(normalized)
  ) {
    return 'DESIGNATED';
  }

  throw new Error(
    'bundle_allocation_method은 EQUAL, PROPORTIONAL, DESIGNATED 중 하나여야 합니다.',
  );
}

function normalizePremiumBaseMethod(value) {
  const normalized = normalizeMobileBundleType(value);
  if (!['FIXED', 'TOTAL'].includes(normalized)) {
    throw new Error(
      'premium_family_base_method은 FIXED 또는 TOTAL이어야 합니다.',
    );
  }
  return normalized;
}

function normalizePremiumBaseInternetDiscountTarget(value) {
  if (!hasValue(value)) {
    throw new Error(
      '프리미엄 가족결합에는 premium_base_internet_discount_target 값이 필요합니다.',
    );
  }

  const normalized = enumToken(value);
  if (['INTERNET', '인터넷'].includes(normalized)) return 'INTERNET';
  if (
    ['BASE_MOBILE', 'BASE_LINE', '베이스_모바일', '베이스회선'].includes(
      normalized,
    )
  ) {
    return 'BASE_MOBILE';
  }

  throw new Error(
    'premium_base_internet_discount_target은 INTERNET 또는 BASE_MOBILE이어야 합니다.',
  );
}

function normalizeNetworkType(value) {
  if (!hasValue(value)) return null;

  const normalized = enumToken(value);
  if (['5G', 'NR'].includes(normalized)) return '5G';
  if (['LTE', '4G'].includes(normalized)) return 'LTE';
  throw new Error('network_type 값은 5G 또는 LTE여야 합니다.');
}

function parseMonthlyFeeList(value, planMonthlyFee, required) {
  if (!hasValue(value) || (Array.isArray(value) && value.length === 0)) {
    if (required) {
      throw new Error(
        '선택한 결합을 계산하려면 family_mobile_monthly_fees 배열이 필요합니다. 예: [90000, 90000]',
      );
    }
    return [planMonthlyFee];
  }

  let rawList = value;
  if (typeof rawList === 'string') {
    const trimmed = rawList.trim();
    try {
      rawList = JSON.parse(trimmed);
    } catch {
      rawList = trimmed.split(',').map((item) => item.trim());
    }
  }

  if (!Array.isArray(rawList) || rawList.length === 0) {
    throw new Error(
      'family_mobile_monthly_fees는 한 개 이상의 월정액을 담은 배열이어야 합니다.',
    );
  }
  if (rawList.length > KT_BUNDLE_MAX_MOBILE_LINES) {
    throw new Error(
      `KT 가족결합 모바일은 최대 ${KT_BUNDLE_MAX_MOBILE_LINES}회선까지 계산할 수 있습니다.`,
    );
  }

  return rawList.map((fee, index) => {
    const parsed = nonNegative(
      fee,
      `family_mobile_monthly_fees[${index}]`,
    );
    return parsed;
  });
}

function fixedBundleMobileDiscount(monthlyFee) {
  if (monthlyFee >= 77000) return 7000;
  if (monthlyFee >= 61000) return 5000;
  if (monthlyFee >= 37000) return 3000;
  return 0;
}

function totalBundlePool(monthlyTotal, internetTier) {
  let bracketIndex = 0;
  if (monthlyTotal >= 174900) bracketIndex = 5;
  else if (monthlyTotal >= 141900) bracketIndex = 4;
  else if (monthlyTotal >= 108900) bracketIndex = 3;
  else if (monthlyTotal >= 64900) bracketIndex = 2;
  else if (monthlyTotal >= 22000) bracketIndex = 1;

  const basicPlus = [
    { internet: 2200, mobile: 0, total: 2200 },
    { internet: 5500, mobile: 0, total: 5500 },
    { internet: 5500, mobile: 5500, total: 11000 },
    { internet: 5500, mobile: 16610, total: 22110 },
    { internet: 5500, mobile: 22110, total: 27610 },
    { internet: 5500, mobile: 27610, total: 33110 },
  ];
  const slim = [
    { internet: 1650, mobile: 0, total: 1650 },
    { internet: 3300, mobile: 0, total: 3300 },
    { internet: 5500, mobile: 3300, total: 8800 },
    { internet: 5500, mobile: 14300, total: 19800 },
    { internet: 5500, mobile: 18700, total: 24200 },
    { internet: 5500, mobile: 23100, total: 28600 },
  ];

  return (internetTier === 'BASIC_PLUS' ? basicPlus : slim)[bracketIndex];
}

function scaleBundlePool(pool, factor) {
  const internet = Math.round(pool.internet * factor);
  const mobile = Math.round(pool.mobile * factor);
  return {
    internet,
    mobile,
    total: internet + mobile,
  };
}

function allocateTotalMobileDiscount({
  mobilePool,
  monthlyFees,
  lineOrders,
  targetLineOrder,
  allocationMethod,
  designatedLineOrder,
}) {
  const targetIndex = lineOrders.indexOf(targetLineOrder);
  if (targetIndex < 0) {
    throw new Error('계산 대상 회선이 총액결합 할인 배분 대상에 없습니다.');
  }
  const roundedPool = Math.round(mobilePool);
  if (roundedPool <= 0) return 0;

  if (allocationMethod === 'EQUAL') {
    const baseShare = Math.floor(roundedPool / lineOrders.length);
    const remainder = roundedPool - baseShare * lineOrders.length;
    return baseShare + (targetIndex < remainder ? 1 : 0);
  }
  if (allocationMethod === 'PROPORTIONAL') {
    const total = monthlyFees.reduce((sum, fee) => sum + fee, 0);
    if (total <= 0) return 0;

    const exactShares = monthlyFees.map(
      (fee) => roundedPool * fee / total,
    );
    const shares = exactShares.map(Math.floor);
    let remainder = roundedPool - shares.reduce((sum, share) => sum + share, 0);
    const remainderOrder = exactShares
      .map((share, index) => ({
        index,
        fraction: share - Math.floor(share),
        lineOrder: lineOrders[index],
      }))
      .sort(
        (a, b) =>
          b.fraction - a.fraction || a.lineOrder - b.lineOrder,
      );
    for (let index = 0; index < remainder; index += 1) {
      shares[remainderOrder[index].index] += 1;
    }
    return shares[targetIndex];
  }

  if (!hasValue(designatedLineOrder)) {
    throw new Error(
      'DESIGNATED 방식에는 designated_mobile_line_order가 필요합니다.',
    );
  }
  const designated = requiredPositiveInteger(
    designatedLineOrder,
    'designated_mobile_line_order',
  );
  if (!lineOrders.includes(designated)) {
    throw new Error(
      'designated_mobile_line_order가 총액결합 할인 배분 대상 회선이 아닙니다.',
    );
  }
  if (designated !== targetLineOrder) {
    throw new Error(
      'DESIGNATED 방식은 현재 견적의 mobile_line_order와 designated_mobile_line_order가 같아야 합니다. 지정회선 잔여 할인액의 타 회선 이월은 단일 회선 견적만으로 정확히 계산할 수 없습니다.',
    );
  }
  return roundedPool;
}

function premiumYouthDiscount(
  calculation,
  planMonthlyFee,
  monthlyFees,
  targetLineOrder,
) {
  if (!booleanValue(calculation.premium_youth_discount_requested)) return 0;

  const requiredFields = [
    'target_age',
    'target_network_type',
    'legal_guardian_in_bundle',
    'guardian_mobile_line_order',
    'guardian_network_type',
    'guardian_plan_monthly_fee',
  ];
  const missingFields = requiredFields.filter(
    (fieldName) => !hasValue(calculation[fieldName]),
  );
  if (missingFields.length > 0) {
    throw new Error(
      `청소년 추가할인 신청에 필요한 값이 없습니다: ${missingFields.join(', ')}`,
    );
  }

  const targetAge = numberValue(calculation.target_age, 'target_age');
  if (!Number.isInteger(targetAge) || targetAge < 0 || targetAge > 18) {
    throw new Error('청소년 추가할인은 target_age가 만 18세 이하여야 합니다.');
  }

  const targetNetwork = normalizeNetworkType(calculation.target_network_type);
  const guardianNetwork = normalizeNetworkType(
    calculation.guardian_network_type,
  );
  const guardianLineOrder = requiredPositiveInteger(
    calculation.guardian_mobile_line_order,
    'guardian_mobile_line_order',
  );
  const guardianPlanMonthlyFee = nonNegative(
    calculation.guardian_plan_monthly_fee,
    'guardian_plan_monthly_fee',
  );

  if (guardianLineOrder === targetLineOrder) {
    throw new Error('법정대리인 회선은 계산 대상 청소년 회선과 달라야 합니다.');
  }
  if (guardianLineOrder > monthlyFees.length) {
    throw new Error(
      'guardian_mobile_line_order가 family_mobile_monthly_fees 회선 수보다 큽니다.',
    );
  }
  if (monthlyFees[guardianLineOrder - 1] !== guardianPlanMonthlyFee) {
    throw new Error(
      'guardian_plan_monthly_fee가 가족 회선 배열의 법정대리인 월정액과 다릅니다.',
    );
  }
  if (!booleanValue(calculation.legal_guardian_in_bundle)) {
    throw new Error('청소년 추가할인은 법정대리인 회선이 같은 결합에 있어야 합니다.');
  }
  if (targetNetwork !== '5G' || guardianNetwork !== '5G') {
    throw new Error('청소년과 법정대리인 모두 5G 요금제를 사용해야 합니다.');
  }
  if (
    planMonthlyFee < KT_PREMIUM_YOUTH_MOBILE_FEE_MIN ||
    guardianPlanMonthlyFee < KT_PREMIUM_YOUTH_MOBILE_FEE_MIN
  ) {
    throw new Error(
      `청소년과 법정대리인 모두 월정액 ${KT_PREMIUM_YOUTH_MOBILE_FEE_MIN.toLocaleString('ko-KR')}원 이상 요금제가 필요합니다.`,
    );
  }

  return 5500;
}

function resolveMobileBundleDiscount(calculation, planMonthlyFee) {
  const householdBundleType = normalizeHouseholdBundleType(
    calculation.household_bundle_type,
  );
  const mobileBundleType = normalizeMobileBundleType(
    calculation.mobile_bundle_type,
  );

  if (
    booleanValue(calculation.premium_youth_discount_requested) &&
    mobileBundleType !== 'PREMIUM_FAMILY'
  ) {
    throw new Error(
      'premium_youth_discount_requested는 PREMIUM_FAMILY에서만 사용할 수 있습니다.',
    );
  }

  if (
    householdBundleType === 'LIVING_APART_FAMILY' &&
    mobileBundleType === 'NONE'
  ) {
    throw new Error(
      '따로 살아도 가족결합에는 mobile_bundle_type(FIXED, TOTAL, PREMIUM_FAMILY)이 필요합니다.',
    );
  }
  if (
    householdBundleType === 'LIVING_APART_FAMILY' &&
    mobileBundleType === 'PREMIUM_SINGLE'
  ) {
    throw new Error(
      '따로 살아도 가족결합의 모바일 할인 방식으로 PREMIUM_SINGLE은 선택할 수 없습니다.',
    );
  }

  if (mobileBundleType === 'NONE') {
    return {
      householdBundleType,
      mobileBundleType,
      internetTier: 'NONE',
      internetProductType: null,
      baseInternetDiscountEligible: false,
      internetContractMonths: null,
      internetContractDiscountFactor: null,
      familyEligible: false,
      monthlyFees: [planMonthlyFee],
      familyMonthlyTotal: planMonthlyFee,
      targetLineOrder: 1,
      baseLineOrder: null,
      premiumEligibleLineCount: 0,
      allocationMethod: null,
      premiumBaseMethod: null,
      premiumBaseInternetDiscountTarget: null,
      baseMobileDiscount: 0,
      youthDiscount: 0,
      mobileDiscount: 0,
      internetDiscountReference: 0,
      premiumFamily25PercentActive: false,
      premiumFamilyFallbackApplied: false,
    };
  }

  const internetTier = normalizeInternetTier(
    calculation.internet_tier ?? calculation.internet_grade,
    calculation.internet_speed_mbps,
  );
  if (internetTier === 'NONE') {
    throw new Error(
      'KT 유무선 결합을 계산하려면 internet_tier 또는 internet_speed_mbps가 필요합니다.',
    );
  }
  const internetProductType = normalizeInternetProductType(
    calculation.internet_product_type,
  );
  if (
    internetProductType === 'SINGLE_INTERNET_BASIC' &&
    internetTier !== 'BASIC_PLUS'
  ) {
    throw new Error(
      'SINGLE_INTERNET_BASIC의 internet_tier는 BASIC_PLUS여야 합니다.',
    );
  }
  const baseInternetDiscountEligible = internetProductType === 'STANDARD';
  let internetContract = {
    months: null,
    factor: null,
  };
  if (mobileBundleType === 'PREMIUM_SINGLE') {
    if (hasValue(calculation.internet_contract_months)) {
      const months = requiredPositiveInteger(
        calculation.internet_contract_months,
        'internet_contract_months',
      );
      if (![12, 24, 36].includes(months)) {
        throw new Error(
          'internet_contract_months는 12, 24, 36 중 하나여야 합니다.',
        );
      }
      internetContract.months = months;
    }
  } else {
    internetContract = internetContractDiscountFactor(
      calculation.internet_contract_months,
    );
  }

  const needsFamilyFeeList = ['TOTAL', 'PREMIUM_FAMILY'].includes(
    mobileBundleType,
  );
  const monthlyFees = parseMonthlyFeeList(
    calculation.family_mobile_monthly_fees,
    planMonthlyFee,
    needsFamilyFeeList,
  );
  const requestedTargetLineOrder =
    calculation.mobile_line_order ?? calculation.target_line_order;
  if (monthlyFees.length > 1 && !hasValue(requestedTargetLineOrder)) {
    throw new Error(
      '2회선 이상 결합에서는 계산 대상 회선을 구분하기 위해 mobile_line_order가 필요합니다.',
    );
  }
  const targetLineOrder = hasValue(requestedTargetLineOrder)
    ? requiredPositiveInteger(requestedTargetLineOrder, 'mobile_line_order')
    : 1;

  if (targetLineOrder > monthlyFees.length) {
    throw new Error(
      'mobile_line_order가 family_mobile_monthly_fees 회선 수보다 큽니다.',
    );
  }
  if (monthlyFees[targetLineOrder - 1] !== planMonthlyFee) {
    throw new Error(
      'family_mobile_monthly_fees의 계산 대상 회선 월정액이 own_plans.monthly_fee와 다릅니다.',
    );
  }

  const familyEligible = booleanValue(calculation.family_eligible);
  if (monthlyFees.length > 1 && !familyEligible) {
    throw new Error(
      '2회선 이상 가족결합에는 family_eligible=true가 필요합니다.',
    );
  }

  const allLineOrders = monthlyFees.map((_, index) => index + 1);
  const familyMonthlyTotal = monthlyFees.reduce((sum, fee) => sum + fee, 0);
  let baseLineOrder = null;
  let premiumEligibleLineCount = 0;
  let allocationMethod = null;
  let premiumBaseMethod = null;
  let premiumBaseInternetDiscountTarget = null;
  let premiumFamily25PercentActive = false;
  let premiumFamilyFallbackApplied = false;
  let baseMobileDiscount = 0;
  let youthDiscount = 0;
  let internetDiscountReference = 0;

  if (mobileBundleType === 'FIXED') {
    baseMobileDiscount = Math.round(
      fixedBundleMobileDiscount(planMonthlyFee) * internetContract.factor,
    );
    internetDiscountReference = baseInternetDiscountEligible
      ? Math.round(5500 * internetContract.factor)
      : 0;
  }

  if (mobileBundleType === 'TOTAL') {
    allocationMethod = normalizeAllocationMethod(
      calculation.bundle_allocation_method ?? calculation.allocation_method,
    );
    const pool = scaleBundlePool(
      totalBundlePool(familyMonthlyTotal, internetTier),
      internetContract.factor,
    );
    baseMobileDiscount = allocateTotalMobileDiscount({
      mobilePool: pool.mobile,
      monthlyFees,
      lineOrders: allLineOrders,
      targetLineOrder,
      allocationMethod,
      designatedLineOrder:
        calculation.designated_mobile_line_order ??
        calculation.discount_line_order,
    });
    internetDiscountReference = baseInternetDiscountEligible
      ? pool.internet
      : 0;
  }

  if (mobileBundleType === 'PREMIUM_SINGLE') {
    if (internetTier !== 'BASIC_PLUS') {
      throw new Error(
        '프리미엄 싱글결합은 인터넷 베이직 이상이 필요합니다.',
      );
    }
    if (internetProductType === 'SINGLE_INTERNET_BASIC') {
      throw new Error(
        '싱글 인터넷 베이직은 프리미엄 싱글결합 대상이 아닙니다.',
      );
    }
    if (monthlyFees.length !== 1 || targetLineOrder !== 1) {
      throw new Error('프리미엄 싱글결합은 모바일 1회선만 가능합니다.');
    }
    if (planMonthlyFee < KT_PREMIUM_MOBILE_FEE_MIN) {
      throw new Error(
        `프리미엄 싱글결합은 월정액 ${KT_PREMIUM_MOBILE_FEE_MIN.toLocaleString('ko-KR')}원 이상 요금제가 필요합니다.`,
      );
    }
    premiumEligibleLineCount = 1;
    baseMobileDiscount = Math.round(planMonthlyFee * 0.25);
  }

  if (mobileBundleType === 'PREMIUM_FAMILY') {
    if (internetTier !== 'BASIC_PLUS') {
      throw new Error(
        '프리미엄 가족결합은 인터넷 베이직 이상이 필요합니다.',
      );
    }

    const premiumLineOrders = allLineOrders.filter(
      (lineOrder) =>
        monthlyFees[lineOrder - 1] >= KT_PREMIUM_MOBILE_FEE_MIN,
    );
    premiumEligibleLineCount = premiumLineOrders.length;
    if (premiumEligibleLineCount < 1) {
      throw new Error(
        `프리미엄 가족결합 옵션에는 월정액 ${KT_PREMIUM_MOBILE_FEE_MIN.toLocaleString('ko-KR')}원 이상 모바일이 1회선 이상 필요합니다. 1회선일 때는 정액/총액 방식만 적용됩니다.`,
      );
    }

    baseLineOrder = requiredPositiveInteger(
      calculation.base_mobile_line_order ?? calculation.base_line_order,
      'base_mobile_line_order',
    );
    if (!premiumLineOrders.includes(baseLineOrder)) {
      throw new Error(
        'base_mobile_line_order는 월정액 77,000원 이상 회선이어야 합니다.',
      );
    }

    premiumBaseMethod = normalizePremiumBaseMethod(
      calculation.premium_family_base_method ??
        calculation.base_discount_method,
    );
    premiumBaseInternetDiscountTarget =
      normalizePremiumBaseInternetDiscountTarget(
        calculation.premium_base_internet_discount_target,
      );
    if (
      premiumBaseInternetDiscountTarget === 'BASE_MOBILE' &&
      !baseInternetDiscountEligible
    ) {
      throw new Error(
        '현재 인터넷 상품은 인터넷 할인액을 베이스 모바일로 이전할 수 없습니다.',
      );
    }
    const targetIsPremiumAdditionalLine =
      premiumEligibleLineCount >= 2 &&
      planMonthlyFee >= KT_PREMIUM_MOBILE_FEE_MIN &&
      targetLineOrder !== baseLineOrder;
    premiumFamily25PercentActive = premiumEligibleLineCount >= 2;
    premiumFamilyFallbackApplied = !targetIsPremiumAdditionalLine;

    const totalEligibleLineOrders = allLineOrders.filter(
      (lineOrder) =>
        lineOrder === baseLineOrder ||
        monthlyFees[lineOrder - 1] < KT_PREMIUM_MOBILE_FEE_MIN,
    );
    const totalEligibleMonthlyFees = totalEligibleLineOrders.map(
      (lineOrder) => monthlyFees[lineOrder - 1],
    );
    let baseGroupInternetDiscount = 0;

    if (premiumBaseMethod === 'FIXED') {
      baseGroupInternetDiscount = baseInternetDiscountEligible
        ? Math.round(5500 * internetContract.factor)
        : 0;
      if (targetIsPremiumAdditionalLine) {
        baseMobileDiscount = Math.round(planMonthlyFee * 0.25);
      } else {
        baseMobileDiscount = Math.round(
          fixedBundleMobileDiscount(planMonthlyFee) * internetContract.factor,
        );
      }
    } else {
      allocationMethod = normalizeAllocationMethod(
        calculation.bundle_allocation_method ?? calculation.allocation_method,
      );
      if (allocationMethod === 'DESIGNATED') {
        throw new Error(
          '프리미엄 가족결합의 베이스 총액 방식은 EQUAL 또는 PROPORTIONAL만 가능합니다.',
        );
      }
      const totalEligibleMonthlyFee = totalEligibleMonthlyFees.reduce(
        (sum, fee) => sum + fee,
        0,
      );
      const pool = scaleBundlePool(
        totalBundlePool(totalEligibleMonthlyFee, internetTier),
        internetContract.factor,
      );
      baseGroupInternetDiscount = baseInternetDiscountEligible
        ? pool.internet
        : 0;
      if (targetIsPremiumAdditionalLine) {
        baseMobileDiscount = Math.round(planMonthlyFee * 0.25);
      } else {
        baseMobileDiscount = allocateTotalMobileDiscount({
          mobilePool: pool.mobile,
          monthlyFees: totalEligibleMonthlyFees,
          lineOrders: totalEligibleLineOrders,
          targetLineOrder,
          allocationMethod,
          designatedLineOrder: null,
        });
      }
    }

    const moveInternetDiscountToBaseMobile =
      premiumBaseInternetDiscountTarget === 'BASE_MOBILE';
    internetDiscountReference = moveInternetDiscountToBaseMobile
      ? 0
      : baseGroupInternetDiscount;
    if (
      moveInternetDiscountToBaseMobile &&
      targetLineOrder === baseLineOrder
    ) {
      baseMobileDiscount += baseGroupInternetDiscount;
    }

    youthDiscount = premiumYouthDiscount(
      calculation,
      planMonthlyFee,
      monthlyFees,
      targetLineOrder,
    );
  }

  return {
    householdBundleType,
    mobileBundleType,
    internetTier,
    internetProductType,
    baseInternetDiscountEligible,
    internetContractMonths: internetContract.months,
    internetContractDiscountFactor: internetContract.factor,
    familyEligible,
    monthlyFees,
    familyMonthlyTotal,
    targetLineOrder,
    baseLineOrder,
    premiumEligibleLineCount,
    allocationMethod,
    premiumBaseMethod,
    premiumBaseInternetDiscountTarget,
    premiumFamily25PercentActive,
    premiumFamilyFallbackApplied,
    baseMobileDiscount,
    youthDiscount,
    mobileDiscount: baseMobileDiscount + youthDiscount,
    internetDiscountReference,
  };
}

function normalizeDbRate(value, fieldName) {
  const parsed = nonNegative(value, fieldName);
  if (parsed <= 1) return parsed;
  if (parsed <= 100) return parsed / 100;

  throw new Error(
    `${fieldName} 값은 0~1 사이의 비율 또는 0~100 사이의 퍼센트 값이어야 합니다. 예: 25%는 0.25 또는 25입니다.`,
  );
}

function canonicalDbEnum(value, fieldName, aliases) {
  if (!hasValue(value)) {
    throw new Error(
      `BUNDLE_ENUM_UNMAPPED: ${fieldName} 값이 비어 있습니다. DB 규칙의 분류값을 입력하세요.`,
    );
  }

  const normalized = enumToken(value);
  for (const [canonical, values] of Object.entries(aliases)) {
    if (values.includes(normalized)) return canonical;
  }

  throw new Error(
    `BUNDLE_ENUM_UNMAPPED: ${fieldName} 값 '${value}'을 해석할 수 없습니다. 허용값: ${Object.keys(aliases).join(', ')}`,
  );
}

function canonicalDbService(value) {
  return canonicalDbEnum(value, 'bundle_rules.service', {
    MOBILE: ['MOBILE', 'WIRELESS', 'MOBILE_PHONE', '휴대폰', '모바일'],
    INTERNET: ['INTERNET', 'BROADBAND', '인터넷'],
    TV: ['TV', 'IPTV', '텔레비전'],
    ALL: [
      'ALL',
      'COMMON',
      'BUNDLE',
      'COMBINED',
      'MIXED',
      'MOBILE_INTERNET',
      '전체',
      '공통',
      '결합',
      '혼합',
    ],
  });
}

function canonicalDbScope(value) {
  return canonicalDbEnum(value, 'bundle_rules.scope', {
    LINE: [
      'LINE',
      'PER_LINE',
      'INDIVIDUAL',
      'MOBILE_LINE',
      'SINGLE_LINE',
      '개별',
      '회선',
    ],
    GROUP: [
      'GROUP',
      'HOUSEHOLD',
      'FAMILY',
      'POOL',
      'BUNDLE',
      'TOTAL',
      '그룹',
      '가족',
      '가구',
      '전체',
    ],
    BASE: ['BASE', 'BASE_LINE', 'REPRESENTATIVE', 'PRIMARY', '베이스', '대표'],
    ADDITIONAL: [
      'ADDITIONAL',
      'ADDITIONAL_LINE',
      'EXTRA_LINE',
      'SUB_LINE',
      '추가',
      '추가회선',
    ],
    YOUTH: ['YOUTH', 'YOUTH_LINE', 'TEEN', '청소년'],
    INTERNET: ['INTERNET', 'INTERNET_LINE', '인터넷'],
  });
}

function canonicalDbFeeBasis(value) {
  return canonicalDbEnum(value, 'bundle_rules.fee_basis', {
    LINE_MONTHLY_FEE: [
      'LINE_MONTHLY_FEE',
      'PER_LINE',
      'PLAN_MONTHLY_FEE',
      'INDIVIDUAL_MONTHLY_FEE',
      'MOBILE_MONTHLY_FEE',
      'MONTHLY_FEE',
      '회선_월정액',
      '요금제_월정액',
    ],
    GROUP_MOBILE_TOTAL: [
      'GROUP_MOBILE_TOTAL',
      'TOTAL_FEE',
      'TOTAL_MONTHLY_FEE',
      'FAMILY_TOTAL',
      'MOBILE_FEE_SUM',
      '가족_모바일_총액',
      '모바일_총액',
    ],
    INTERNET_SPEED: ['INTERNET_SPEED', 'SPEED', '인터넷_속도'],
    NONE: ['NONE', 'NOT_APPLICABLE', 'N_A', '해당없음'],
  });
}

function canonicalDbRuleType(value) {
  return canonicalDbEnum(value, 'bundle_rules.type', {
    AMOUNT: [
      'AMOUNT',
      'DISCOUNT',
      'DISCOUNT_AMOUNT',
      'FIXED_AMOUNT',
      'MOBILE_DISCOUNT',
      'INTERNET_DISCOUNT',
      'BASE_INTERNET',
      '금액',
      '할인금액',
    ],
    RATE: [
      'RATE',
      'PERCENT',
      'PERCENTAGE',
      'DISCOUNT_RATE',
      'MOBILE_RATE',
      '할인율',
      '비율',
    ],
    ADDON: [
      'ADDON',
      'ADD_ON',
      'EXTRA',
      'EXTRA_DISCOUNT',
      'YOUTH',
      'YOUTH_DISCOUNT',
      'YOUTH_EXTRA',
      '추가할인',
      '청소년할인',
    ],
    FIXED: [
      'FIXED',
      'FIXED_FEE_TIER',
      'PER_LINE_FEE',
      '정액',
      '정액결합',
    ],
    TOTAL: ['TOTAL', 'TOTAL_FEE', 'TOTAL_FEE_TIER', '총액', '총액결합'],
    PREMIUM_FAMILY: [
      'PREMIUM_FAMILY',
      'PREMIUM_FAMILY_RATE',
      'ADDITIONAL_LINE',
      '프리미엄_가족결합',
    ],
    PREMIUM_SINGLE: [
      'PREMIUM_SINGLE',
      'PREMIUM_SINGLE_RATE',
      'SINGLE_LINE',
      '프리미엄_싱글결합',
    ],
  });
}

function dbBundleKind(value) {
  if (!hasValue(value)) return null;

  const normalized = enumToken(value);
  const aliases = {
    FIXED: [
      'FIXED',
      'FIXED_AMOUNT',
      'FIXED_FEE_TIER',
      'FLAT',
      'PER_LINE',
      'PER_LINE_FEE',
      'LINE_MONTHLY_FEE',
      'PLAN_MONTHLY_FEE',
      'INDIVIDUAL_MONTHLY_FEE',
      '정액',
      '정액결합',
      '정액결합할인',
    ],
    TOTAL: [
      'TOTAL',
      'TOTAL_AMOUNT',
      'TOTAL_FEE',
      'TOTAL_FEE_TIER',
      'FAMILY_TOTAL',
      'GROUP_TOTAL',
      'GROUP_MOBILE_TOTAL',
      'MOBILE_TOTAL',
      'MOBILE_FEE_SUM',
      '총액',
      '총액결합',
      '총액결합할인',
    ],
    PREMIUM_FAMILY: [
      'PREMIUM_FAMILY',
      'PREMIUM_FAMILY_RATE',
      '프리미엄_가족결합',
      '프리미엄가족결합',
    ],
    PREMIUM_SINGLE: [
      'PREMIUM_SINGLE',
      'PREMIUM_SINGLE_RATE',
      '프리미엄_싱글결합',
      '프리미엄싱글결합',
    ],
    LIVING_APART_FAMILY: [
      'LIVING_APART_FAMILY',
      'SEPARATE_HOUSEHOLD_FAMILY',
      '따로_살아도_가족결합',
      '따로살아도가족결합',
    ],
  };

  for (const [kind, values] of Object.entries(aliases)) {
    if (values.includes(normalized)) return kind;
  }
  return null;
}

function dbBundleDeclaredKind(bundle) {
  const fields = [
    ['name', bundle?.name],
    ['discount_method', bundle?.discount_method],
    ['type', bundle?.type],
  ];
  const declarations = fields
    .map(([field, value]) => ({ field, value, kind: dbBundleKind(value) }))
    .filter(({ kind }) => kind);
  const kinds = [...new Set(declarations.map(({ kind }) => kind))];

  if (kinds.length > 1) {
    throw new Error(
      `BUNDLE_POLICY_CONFLICT: bundles의 name/type/discount_method가 서로 다른 결합방식을 나타냅니다: ${declarations.map(({ field, value, kind }) => `${field}=${value}(${kind})`).join(', ')}`,
    );
  }
  return kinds[0] ?? null;
}

function dbRuleDeclaredKind(rule) {
  const declarations = [
    ['type', rule?.type],
    ['fee_basis', rule?.fee_basis],
  ]
    .map(([field, value]) => ({ field, value, kind: dbBundleKind(value) }))
    .filter(({ kind }) => ['FIXED', 'TOTAL'].includes(kind));
  const kinds = [...new Set(declarations.map(({ kind }) => kind))];

  if (kinds.length > 1) {
    throw new Error(
      `BUNDLE_POLICY_CONFLICT: bundle_rules ${rule.id ?? '(id 없음)'}의 type과 fee_basis가 충돌합니다: ${declarations.map(({ field, value, kind }) => `${field}=${value}(${kind})`).join(', ')}`,
    );
  }
  return kinds[0] ?? null;
}

function dbRuleRangeMatches(rule, { fee, speed, line }) {
  if (hasValue(rule.min_fee) && fee < numberValue(rule.min_fee, 'bundle_rules.min_fee')) {
    return false;
  }
  // 요금 구간은 [min_fee, max_fee)로 해석합니다.
  if (hasValue(rule.max_fee) && fee >= numberValue(rule.max_fee, 'bundle_rules.max_fee')) {
    return false;
  }
  if (hasValue(rule.min_speed)) {
    if (speed === null || speed < numberValue(rule.min_speed, 'bundle_rules.min_speed')) {
      return false;
    }
  }
  if (hasValue(rule.max_speed)) {
    if (speed === null || speed > numberValue(rule.max_speed, 'bundle_rules.max_speed')) {
      return false;
    }
  }
  if (hasValue(rule.min_line) && line < numberValue(rule.min_line, 'bundle_rules.min_line')) {
    return false;
  }
  if (hasValue(rule.max_line) && line > numberValue(rule.max_line, 'bundle_rules.max_line')) {
    return false;
  }
  return true;
}

function dbInternetSpeed(calculation, internetTier) {
  if (hasValue(calculation.internet_speed_mbps)) {
    return nonNegative(
      calculation.internet_speed_mbps,
      'internet_speed_mbps',
    );
  }
  if (internetTier === 'BASIC_PLUS') return 500;
  if (internetTier === 'SLIM') return 100;
  return null;
}

function dbRuleSummary(rule) {
  return `${rule.id ?? '(id 없음)'}[${[
    rule.type,
    rule.service,
    rule.scope,
    rule.fee_basis,
  ].filter(hasValue).join('/')}]`;
}

function selectUniqueDbRule({
  rules,
  amountField,
  fee,
  speed,
  line,
  method = null,
  label,
  allowCustomerCondition = false,
  allowedServices,
  allowedScopes,
  allowedFeeBases,
  allowedRuleTypes,
  requireYouthMarker = false,
  allowUnspecifiedMethod = false,
}) {
  const candidatesBeforeCondition = rules.filter((rule) => {
    if (!hasValue(rule[amountField])) return false;

    const service = canonicalDbService(rule.service);
    const scope = canonicalDbScope(rule.scope);
    const feeBasis = canonicalDbFeeBasis(rule.fee_basis);
    const ruleType = canonicalDbRuleType(rule.type);

    if (!allowedServices.includes(service)) return false;
    if (!allowedScopes.includes(scope)) return false;
    if (!allowedFeeBases.includes(feeBasis)) return false;
    if (allowedRuleTypes && !allowedRuleTypes.includes(ruleType)) return false;

    if (!dbRuleRangeMatches(rule, { fee, speed, line })) return false;

    if (method) {
      const declaredKind = dbRuleDeclaredKind(rule);
      if (declaredKind && declaredKind !== method) return false;
      if (!declaredKind && !allowUnspecifiedMethod) return false;
    }

    if (requireYouthMarker) {
      const youthText = [
        rule.type,
        rule.scope,
        rule.customer_condition,
      ]
        .filter(hasValue)
        .map(enumToken)
        .join('|');
      if (!/(YOUTH|TEEN|청소년)/.test(youthText)) return false;
      if (hasValue(rule.customer_condition)) {
        const condition = enumToken(rule.customer_condition);
        const allowedYouthConditions = [
          'YOUTH',
          'TEEN',
          'YOUTH_ELIGIBLE',
          'AGE_18_OR_YOUNGER',
          'AGE_18_OR_UNDER',
          '청소년',
          '만_18세_이하',
        ];
        if (!allowedYouthConditions.includes(condition)) return false;
      }
    }
    return true;
  });

  const candidates = candidatesBeforeCondition.filter(
    (rule) =>
      allowCustomerCondition || !hasValue(rule.customer_condition),
  );

  if (candidates.length === 0) {
    const blocked = candidatesBeforeCondition
      .filter((rule) => hasValue(rule.customer_condition))
      .map(dbRuleSummary);
    if (blocked.length > 0) {
      throw new Error(
        `${label} 규칙의 customer_condition은 자유문장이어서 자동 적용할 수 없습니다: ${blocked.join(', ')}`,
      );
    }
    throw new Error(
      `${label}에 맞는 bundle_rules가 없습니다. ${amountField}, service, scope, fee_basis, type, 요금·속도·회선 구간을 확인하세요.`,
    );
  }
  if (candidates.length > 1) {
    throw new Error(
      `${label}에 여러 bundle_rules가 동시에 일치합니다: ${candidates.map(dbRuleSummary).join(', ')}. 구간이 겹치지 않게 수정하세요.`,
    );
  }
  return candidates[0];
}

function selectOptionalDbRule(options) {
  try {
    return selectUniqueDbRule(options);
  } catch (error) {
    if (String(error.message).includes('에 맞는 bundle_rules가 없습니다.')) {
      return null;
    }
    throw error;
  }
}

function validateDbBundleMetadata(
  calculation,
  bundle,
  policy,
  {
    internetLineCountField = 'internet_line_count',
    tvLineCountField = 'tv_line_count',
    validationNotes = [],
  } = {},
) {
  const lineCount = policy.monthlyFees.length;
  const strictBundleValidation = booleanValue(
    calculation.strict_bundle_validation,
  );

  if (booleanValue(bundle.family_required) && !policy.familyEligible) {
    throw new Error(
      '선택한 bundles 상품은 가족결합이 필요합니다. family_eligible=true로 보내세요.',
    );
  }
  if (
    booleanValue(bundle.internet_required) &&
    policy.internetTier === 'NONE'
  ) {
    throw new Error(
      '선택한 bundles 상품은 인터넷 결합이 필요합니다. 인터넷 조건을 입력하세요.',
    );
  }
  if (
    hasValue(bundle.min_mobile_lines) &&
    lineCount < numberValue(bundle.min_mobile_lines, 'bundles.min_mobile_lines')
  ) {
    throw new Error('결합 휴대폰 회선 수가 bundles.min_mobile_lines보다 적습니다.');
  }
  if (
    hasValue(bundle.max_mobile_lines) &&
    lineCount > numberValue(bundle.max_mobile_lines, 'bundles.max_mobile_lines')
  ) {
    throw new Error('결합 휴대폰 회선 수가 bundles.max_mobile_lines보다 많습니다.');
  }

  if (
    hasValue(bundle.max_internet_lines) &&
    !hasValue(calculation[internetLineCountField])
  ) {
    const message = `${internetLineCountField}가 없어 인터넷 회선 최대 ${bundle.max_internet_lines}회선 조건을 확인할 수 없습니다.`;
    if (strictBundleValidation) throw new Error(message);
    validationNotes.push(`${message} 견적 계산에서는 이 검증을 생략했습니다.`);
  }
  if (hasValue(calculation[internetLineCountField])) {
    const internetLineCount = requiredPositiveInteger(
      calculation[internetLineCountField],
      internetLineCountField,
    );
    if (
      hasValue(bundle.max_internet_lines) &&
      internetLineCount >
        numberValue(bundle.max_internet_lines, 'bundles.max_internet_lines')
    ) {
      throw new Error('인터넷 회선 수가 bundles.max_internet_lines보다 많습니다.');
    }
  }
  if (
    hasValue(bundle.max_tv_lines) &&
    !hasValue(calculation[tvLineCountField])
  ) {
    const message = `${tvLineCountField}가 없어 TV 회선 최대 ${bundle.max_tv_lines}회선 조건을 확인할 수 없습니다.`;
    if (strictBundleValidation) throw new Error(message);
    validationNotes.push(`${message} 견적 계산에서는 이 검증을 생략했습니다.`);
  }
  if (hasValue(calculation[tvLineCountField])) {
    const tvLineCount = nonNegative(
      calculation[tvLineCountField],
      tvLineCountField,
    );
    if (!Number.isInteger(tvLineCount)) {
      throw new Error(`${tvLineCountField}는 0 이상의 정수여야 합니다.`);
    }
    if (
      hasValue(bundle.max_tv_lines) &&
      tvLineCount > numberValue(bundle.max_tv_lines, 'bundles.max_tv_lines')
    ) {
      throw new Error('TV 회선 수가 bundles.max_tv_lines보다 많습니다.');
    }
  }

  const allowedRelations = Array.isArray(bundle.family_relations)
    ? bundle.family_relations.map((value) => String(value))
    : [];
  if (allowedRelations.length > 0 && !hasValue(calculation.family_relation)) {
    const message = `family_relation이 없어 가족관계 허용값을 확인할 수 없습니다. 허용값: ${allowedRelations.join(', ')}`;
    if (strictBundleValidation) throw new Error(message);
    validationNotes.push(`${message} 견적 계산에서는 이 검증을 생략했습니다.`);
  }
  if (
    allowedRelations.length > 0 &&
    hasValue(calculation.family_relation) &&
    !allowedRelations.includes(String(calculation.family_relation))
  ) {
    throw new Error('family_relation이 bundles.family_relations에 포함되지 않습니다.');
  }
}

// 시연용 요청 조건만 생성합니다. DB 객체와 DB 필드명은 변경하지 않습니다.
function injectDemoBundleConditions(calculation, planMonthlyFee, bundle, parentBundle) {
  if (!String(calculation.bundle_id ?? '').trim() || !bundle?.id) return { ...calculation };
  const kind = dbBundleDeclaredKind(bundle);
  if (!kind) return { ...calculation };
  const livingApart = kind === 'LIVING_APART_FAMILY' ||
    (parentBundle && dbBundleDeclaredKind(parentBundle) === 'LIVING_APART_FAMILY');
  const mobileKind = kind === 'LIVING_APART_FAMILY' ? 'FIXED' : kind;
  const metadata = [bundle, ...(parentBundle ? [parentBundle] : [])];
  let lineCount = ['TOTAL', 'PREMIUM_FAMILY'].includes(mobileKind) || livingApart ? 2 : 1;
  for (const row of metadata) {
    if (hasValue(row.min_mobile_lines)) lineCount = Math.max(lineCount,
      requiredPositiveInteger(row.min_mobile_lines, 'bundles.min_mobile_lines'));
  }
  for (const row of metadata) {
    if (hasValue(row.max_mobile_lines)) lineCount = Math.min(lineCount,
      requiredPositiveInteger(row.max_mobile_lines, 'bundles.max_mobile_lines'));
  }
  if (mobileKind === 'PREMIUM_SINGLE') lineCount = 1;
  const capInternet = (row, desired) => hasValue(row?.max_internet_lines)
    ? Math.min(desired, requiredPositiveInteger(row.max_internet_lines, 'bundles.max_internet_lines'))
    : desired;
  const defaults = {
    internet_tier: 'BASIC_PLUS', internet_speed_mbps: 500,
    internet_product_type: 'STANDARD', internet_contract_months: 36,
    family_eligible: mobileKind !== 'PREMIUM_SINGLE' || booleanValue(bundle.family_required),
    family_mobile_monthly_fees: Array.from({ length: lineCount }, (_, i) => i === 0 ? planMonthlyFee : 90000),
    mobile_line_order: 1, bundle_allocation_method: 'EQUAL',
    base_mobile_line_order: lineCount >= 2 ? 2 : 1,
    premium_family_base_method: 'FIXED', premium_base_internet_discount_target: 'INTERNET',
    premium_youth_discount_requested: false, strict_bundle_validation: false,
    internet_line_count: capInternet(bundle, livingApart && kind === 'LIVING_APART_FAMILY' ? 2 : 1),
    tv_line_count: 0,
    household_group_internet_line_count: capInternet(parentBundle ?? bundle, 2),
    household_group_tv_line_count: 0,
  };
  // 명시적으로 제공한 고급 조건은 보존합니다. 6개 입력이면 위 조건을 모두 사용합니다.
  const result = { ...calculation };
  const injected = {};
  for (const [key, value] of Object.entries(defaults)) {
    const aliases = {
      internet_tier: ['internet_grade', 'internet_speed_mbps'],
      mobile_line_order: ['target_line_order'],
      bundle_allocation_method: ['allocation_method'],
      base_mobile_line_order: ['base_line_order'],
      premium_family_base_method: ['base_discount_method'],
    };
    if (key === 'internet_speed_mbps' && (hasValue(calculation.internet_tier) || hasValue(calculation.internet_grade))) continue;
    if (!hasValue(result[key]) && !(aliases[key] ?? []).some(alias => hasValue(calculation[alias]))) {
      result[key] = value;
      injected[key] = value;
    }
  }
  result.bundle_demo_assumptions = injected;
  return result;
}

function resolveDatabaseBundleDiscount(
  calculation,
  planMonthlyFee,
  bundle,
  parentBundle,
  rules,
) {
  const bundleValidationNotes = Object.keys(calculation.bundle_demo_assumptions ?? {}).length
    ? ['시연용 결합 조건을 자동 가정했습니다. 실제 가입 자격을 확인한 결과가 아닙니다.'] : [];
  const strictBundleValidation = booleanValue(
    calculation.strict_bundle_validation,
  );
  const requestedBundleId = String(calculation.bundle_id ?? '').trim();
  if (!requestedBundleId) {
    throw new Error('DB 결합 계산에는 bundle_id가 필요합니다.');
  }
  if (!bundle?.id || String(bundle.id) !== requestedBundleId) {
    throw new Error(
      `bundle_id '${requestedBundleId}'에 해당하는 bundles 행이 없습니다.`,
    );
  }
  // 상위상품에는 모바일 규칙이 없을 수 있으므로 rules 누락 검사보다 먼저 처리합니다.
  if (dbBundleDeclaredKind(bundle) === 'LIVING_APART_FAMILY') {
    const policy = resolveMobileBundleDiscount({
      ...calculation, household_bundle_type: 'LIVING_APART_FAMILY', mobile_bundle_type: 'FIXED',
    }, planMonthlyFee);
    validateDbBundleMetadata(calculation, bundle, policy, { validationNotes: bundleValidationNotes });
    if (!Array.isArray(rules)) throw new Error('bundle_rules는 배열이어야 합니다.');
    if (rules.some(rule => String(rule.bundle_id ?? '') !== requestedBundleId)) {
      throw new Error('다른 bundle_id의 규칙이 섞여 있습니다.');
    }
    // 상위상품의 인터넷/TV 할인은 모바일 요금에 합산하지 않습니다.
    // 동일 ID에 정액 모바일 규칙이 있으면 DB 금액을 우선 사용합니다.
    const rule = selectOptionalDbRule({
      rules, amountField: 'mobile_discount', fee: planMonthlyFee,
      speed: dbInternetSpeed(calculation, policy.internetTier), line: policy.monthlyFees.length,
      method: 'FIXED', label: '따로 살아도 가족결합 시연 정액 모바일 할인',
      allowedServices: ['MOBILE', 'ALL'], allowedScopes: ['LINE', 'BASE'],
      allowedFeeBases: ['LINE_MONTHLY_FEE'], allowedRuleTypes: ['AMOUNT', 'FIXED'],
    });
    const mobileDiscount = rule ? Math.round(nonNegative(rule.mobile_discount,
      'bundle_rules.mobile_discount') * policy.internetContractDiscountFactor) : policy.mobileDiscount;
    bundleValidationNotes.push(rule
      ? '상위상품 직접 선택: 동일 bundle_id의 정액 모바일 규칙으로 시연했습니다.'
      : '상위상품 직접 선택: 모바일 DB 규칙이 없어 코드의 정액 할인표로 시연했습니다. 하위상품 규칙을 조회하거나 적용한 결과가 아닙니다.');
    return {
      ...policy, baseMobileDiscount: mobileDiscount, mobileDiscount,
      internetDiscountReference: 0,
      source: rule ? 'DATABASE' : 'DEMO_POLICY',
      bundleId: bundle.id, bundleName: bundle.name ?? null,
      parentBundleId: parentBundle?.id ?? null, parentBundleName: parentBundle?.name ?? null,
      bundleDiscountMethod: bundle.discount_method ?? null,
      appliedRuleIds: rule?.id ? [rule.id] : [], matchedRuleIds: rule?.id ? [rule.id] : [],
      referenceRuleIds: [], matchMetricName: 'plan_monthly_fee', matchMetricValue: planMonthlyFee,
      bundleEligibilityFullyVerified: false, bundleValidationNotes,
    };
  }
  if (!Array.isArray(rules)) throw new Error('bundle_rules는 배열이어야 합니다.');
  if (
    hasValue(bundle.parent_id) &&
    (!parentBundle?.id || String(parentBundle.id) !== String(bundle.parent_id))
  ) {
    throw new Error(
      `bundles.parent_id '${bundle.parent_id}'에 해당하는 상위 결합상품을 찾을 수 없습니다.`,
    );
  }
  const wrongBundleRuleIds = rules
    .filter((rule) => String(rule.bundle_id ?? '') !== requestedBundleId)
    .map((rule) => rule.id);
  if (wrongBundleRuleIds.length > 0) {
    throw new Error(
      `다른 bundle_id의 규칙이 섞여 있습니다: ${wrongBundleRuleIds.join(', ')}`,
    );
  }

  const declaredBundleKind = dbBundleDeclaredKind(bundle);
  if (!declaredBundleKind) {
    throw new Error(
      `bundles의 할인방식을 해석할 수 없습니다. discount_method/type/name 중 하나를 FIXED, TOTAL, PREMIUM_FAMILY, PREMIUM_SINGLE 또는 LIVING_APART_FAMILY 표준값으로 맞추세요. 현재 값: ${bundle.discount_method ?? '(없음)'}`,
    );
  }

  const requestedMobileBundleType = normalizeMobileBundleType(calculation.mobile_bundle_type);
  let mobileBundleType = requestedMobileBundleType;
  if (mobileBundleType === 'NONE') {
    mobileBundleType = declaredBundleKind;
  }
  if (declaredBundleKind !== mobileBundleType) {
    throw new Error(
      `bundles.discount_method/type/name이 나타내는 방식(${declaredBundleKind})과 mobile_bundle_type(${mobileBundleType})이 다릅니다.`,
    );
  }

  const parentBundleKind = parentBundle
    ? dbBundleDeclaredKind(parentBundle)
    : null;
  const policyInput = { ...calculation };
  delete policyInput.bundle_id;
  policyInput.mobile_bundle_type = mobileBundleType;
  const requestedHouseholdBundleType = normalizeHouseholdBundleType(
    calculation.household_bundle_type,
  );
  if (
    requestedHouseholdBundleType === 'LIVING_APART_FAMILY' &&
    parentBundleKind !== 'LIVING_APART_FAMILY'
  ) {
    throw new Error(
      'household_bundle_type=LIVING_APART_FAMILY이지만 선택한 결합의 parent_id가 따로 살아도 가족결합을 가리키지 않습니다.',
    );
  }
  if (parentBundleKind === 'LIVING_APART_FAMILY') {
    policyInput.household_bundle_type = 'LIVING_APART_FAMILY';
  } else {
    policyInput.household_bundle_type = 'NONE';
  }
  const premiumSingleIneligible = mobileBundleType === 'PREMIUM_SINGLE' &&
    planMonthlyFee < KT_PREMIUM_MOBILE_FEE_MIN;
  const premiumFamilyDemoFallback = mobileBundleType === 'PREMIUM_FAMILY' &&
    policyInput.family_mobile_monthly_fees &&
    parseMonthlyFeeList(policyInput.family_mobile_monthly_fees, planMonthlyFee, true)
      .filter(fee => fee >= KT_PREMIUM_MOBILE_FEE_MIN).length < 2 &&
    Object.keys(calculation.bundle_demo_assumptions ?? {}).length > 0;
  const fixedZeroTier = mobileBundleType === 'FIXED' && planMonthlyFee < 37000;
  if (premiumSingleIneligible || premiumFamilyDemoFallback || fixedZeroTier) {
    const policy = resolveMobileBundleDiscount({
      ...policyInput, mobile_bundle_type: 'FIXED',
    }, planMonthlyFee);
    validateDbBundleMetadata(calculation, bundle, policy, { validationNotes: bundleValidationNotes });
    if (parentBundle) validateDbBundleMetadata(calculation, parentBundle, policy, {
      internetLineCountField: 'household_group_internet_line_count',
      tvLineCountField: 'household_group_tv_line_count', validationNotes: bundleValidationNotes,
    });
    const mobileDiscount = premiumSingleIneligible ? 0 : policy.mobileDiscount;
    const reason = premiumSingleIneligible
      ? '본인 월정액이 77,000원 미만이어서 프리미엄 싱글결합을 적용하지 않았습니다.'
      : premiumFamilyDemoFallback
        ? '77,000원 이상 회선이 2개 미만이어서 프리미엄 25%는 미적용입니다. 정액 방식으로 시연 계산했습니다.'
        : '본인 월정액이 37,000원 미만이어서 정액 모바일 할인은 0원입니다.';
    bundleValidationNotes.push(reason);
    return {
      ...policy,
      mobileBundleType: premiumSingleIneligible ? mobileBundleType : 'FIXED',
      premiumFamily25PercentActive: false,
      premiumFamilyFallbackApplied: premiumFamilyDemoFallback,
      source: premiumSingleIneligible ? 'INELIGIBLE' : 'DEMO_POLICY',
      bundleId: bundle.id, bundleName: bundle.name ?? null,
      parentBundleId: parentBundle?.id ?? null, parentBundleName: parentBundle?.name ?? null,
      bundleDiscountMethod: bundle.discount_method ?? null,
      appliedRuleIds: [], matchedRuleIds: [], referenceRuleIds: [],
      matchMetricName: 'plan_monthly_fee', matchMetricValue: planMonthlyFee,
      baseMobileDiscount: mobileDiscount, youthDiscount: 0, mobileDiscount,
      internetDiscountReference: 0,
      bundleEligibilityFullyVerified: false, bundleValidationNotes,
      applicationStatus: premiumSingleIneligible ? 'NOT_APPLIED' : premiumFamilyDemoFallback ? 'FALLBACK' : 'ZERO_DISCOUNT',
      applicationReason: reason,
    };
  }
  if (rules.length === 0) throw new Error(`bundle_id '${requestedBundleId}'의 bundle_rules가 없습니다.`);
  const policy = resolveMobileBundleDiscount(policyInput, planMonthlyFee);
  validateDbBundleMetadata(calculation, bundle, policy, {
    validationNotes: bundleValidationNotes,
  });
  if (parentBundle) {
    validateDbBundleMetadata(
      calculation,
      parentBundle,
      policy,
      parentBundleKind === 'LIVING_APART_FAMILY'
        ? {
            internetLineCountField: 'household_group_internet_line_count',
            tvLineCountField: 'household_group_tv_line_count',
            validationNotes: bundleValidationNotes,
          }
        : { validationNotes: bundleValidationNotes },
    );
  }

  const speed = dbInternetSpeed(calculation, policy.internetTier);
  const factor = policy.internetContractDiscountFactor ?? 1;
  const matchedRuleIds = new Set();
  const mobileAppliedRuleIds = new Set();
  const referenceRuleIds = new Set();
  let baseMobileDiscount = 0;
  let youthDiscount = 0;
  let internetDiscountReference = 0;
  let matchMetricName = 'plan_monthly_fee';
  let matchMetricValue = planMonthlyFee;

  const useRule = (rule, role = 'MOBILE') => {
    if (rule?.id) {
      matchedRuleIds.add(rule.id);
      if (role === 'REFERENCE') referenceRuleIds.add(rule.id);
      else mobileAppliedRuleIds.add(rule.id);
    }
    return rule;
  };

  const fixedMobileRule = ({ fee, line, method = null, label }) =>
    useRule(
      selectUniqueDbRule({
        rules,
        amountField: 'mobile_discount',
        fee,
        speed,
        line,
        method: method ?? 'FIXED',
        label,
        allowedServices: ['MOBILE', 'ALL'],
        allowedScopes:
          (method ?? 'FIXED') === 'TOTAL'
            ? ['GROUP', 'BASE']
            : ['LINE', 'BASE'],
        allowedFeeBases:
          (method ?? 'FIXED') === 'TOTAL'
            ? ['GROUP_MOBILE_TOTAL']
            : ['LINE_MONTHLY_FEE'],
        allowedRuleTypes:
          (method ?? 'FIXED') === 'TOTAL'
            ? ['AMOUNT', 'TOTAL', 'PREMIUM_FAMILY']
            : ['AMOUNT', 'FIXED', 'PREMIUM_FAMILY'],
      }),
    );

  const optionalInternetRule = ({ fee, line, method = null, label }) => {
    if (!policy.baseInternetDiscountEligible) return null;
    const ruleMethod = method ?? 'FIXED';
    const rule = selectOptionalDbRule({
      rules,
      amountField: 'internet_discount',
      fee,
      speed,
      line,
      method: ruleMethod,
      label,
      allowedServices: ['INTERNET', 'MOBILE', 'ALL'],
      allowedScopes:
        ruleMethod === 'TOTAL'
          ? ['INTERNET', 'GROUP', 'BASE']
          : ['INTERNET', 'LINE', 'BASE'],
      allowedFeeBases:
        ruleMethod === 'TOTAL'
          ? ['GROUP_MOBILE_TOTAL', 'INTERNET_SPEED', 'NONE']
          : ['LINE_MONTHLY_FEE', 'INTERNET_SPEED', 'NONE'],
      allowedRuleTypes:
        ruleMethod === 'TOTAL'
          ? ['AMOUNT', 'TOTAL', 'PREMIUM_FAMILY']
          : ['AMOUNT', 'FIXED', 'PREMIUM_FAMILY'],
      allowUnspecifiedMethod: true,
    });
    return useRule(rule, 'REFERENCE');
  };

  if (mobileBundleType === 'FIXED') {
    const mobileRule = fixedMobileRule({
      fee: planMonthlyFee,
      line: policy.monthlyFees.length,
      label: '정액결합 모바일 할인',
    });
    baseMobileDiscount = Math.round(
      nonNegative(
        mobileRule.mobile_discount,
        'bundle_rules.mobile_discount',
      ) * factor,
    );
    const internetRule = optionalInternetRule({
      fee: planMonthlyFee,
      line: policy.monthlyFees.length,
      label: '정액결합 인터넷 할인',
    });
    internetDiscountReference = internetRule
      ? Math.round(
          nonNegative(
            internetRule.internet_discount,
            'bundle_rules.internet_discount',
          ) * factor,
        )
      : 0;
  }

  if (mobileBundleType === 'TOTAL') {
    matchMetricName = 'family_mobile_monthly_total';
    matchMetricValue = policy.familyMonthlyTotal;
    const poolRule = fixedMobileRule({
      fee: policy.familyMonthlyTotal,
      line: policy.monthlyFees.length,
      method: 'TOTAL',
      label: '총액결합 모바일 할인 풀',
    });
    const mobilePool = Math.round(
      nonNegative(
        poolRule.mobile_discount,
        'bundle_rules.mobile_discount',
      ) * factor,
    );
    baseMobileDiscount = allocateTotalMobileDiscount({
      mobilePool,
      monthlyFees: policy.monthlyFees,
      lineOrders: policy.monthlyFees.map((_, index) => index + 1),
      targetLineOrder: policy.targetLineOrder,
      allocationMethod: policy.allocationMethod,
      designatedLineOrder:
        calculation.designated_mobile_line_order ??
        calculation.discount_line_order,
    });
    const internetRule = optionalInternetRule({
      fee: policy.familyMonthlyTotal,
      line: policy.monthlyFees.length,
      method: 'TOTAL',
      label: '총액결합 인터넷 할인',
    });
    internetDiscountReference = internetRule
      ? Math.round(
          nonNegative(
            internetRule.internet_discount,
            'bundle_rules.internet_discount',
          ) * factor,
        )
      : 0;
  }

  if (mobileBundleType === 'PREMIUM_SINGLE') {
    const rateRule = useRule(selectUniqueDbRule({
      rules,
      amountField: 'mobile_rate',
      fee: planMonthlyFee,
      speed,
      line: 1,
      label: '프리미엄 싱글 모바일 할인율',
      allowedServices: ['MOBILE', 'ALL'],
      allowedScopes: ['LINE'],
      allowedFeeBases: ['LINE_MONTHLY_FEE'],
      allowedRuleTypes: ['RATE', 'PREMIUM_SINGLE'],
      // 견적 모드에서는 자유문장을 임의 해석하지 않고, 코드의 구조화된
      // 단일 회선·요금제·인터넷 조건을 기준으로 계산을 계속합니다.
      allowCustomerCondition: !strictBundleValidation,
    }));
    if (hasValue(rateRule.customer_condition)) {
      bundleValidationNotes.push(
        `프리미엄 싱글 규칙 ${rateRule.id ?? '(id 없음)'}의 customer_condition은 자유문장이어서 자동 검증하지 않았습니다. 견적 모드에서는 구조화된 단일 회선·요금제·인터넷 조건으로 계산했습니다.`,
      );
    }
    baseMobileDiscount = Math.round(
      planMonthlyFee *
        normalizeDbRate(rateRule.mobile_rate, 'bundle_rules.mobile_rate'),
    );
  }

  if (mobileBundleType === 'PREMIUM_FAMILY') {
    const premiumLineOrders = policy.monthlyFees
      .map((fee, index) => ({ fee, lineOrder: index + 1 }))
      .filter(({ fee }) => fee >= KT_PREMIUM_MOBILE_FEE_MIN)
      .map(({ lineOrder }) => lineOrder);
    const targetIsPremiumAdditionalLine =
      premiumLineOrders.length >= 2 &&
      planMonthlyFee >= KT_PREMIUM_MOBILE_FEE_MIN &&
      policy.targetLineOrder !== policy.baseLineOrder;

    const baseEligibleLineOrders = policy.monthlyFees
      .map((fee, index) => ({ fee, lineOrder: index + 1 }))
      .filter(
        ({ fee, lineOrder }) =>
          lineOrder === policy.baseLineOrder ||
          fee < KT_PREMIUM_MOBILE_FEE_MIN,
      )
      .map(({ lineOrder }) => lineOrder);
    const baseEligibleFees = baseEligibleLineOrders.map(
      (lineOrder) => policy.monthlyFees[lineOrder - 1],
    );
    const baseGroupTotal = baseEligibleFees.reduce(
      (sum, fee) => sum + fee,
      0,
    );
    const baseLineFee = policy.monthlyFees[policy.baseLineOrder - 1];
    let baseGroupInternetDiscount = 0;
    let baseGroupInternetRule = null;

    if (targetIsPremiumAdditionalLine) {
      const rateRule = useRule(selectUniqueDbRule({
        rules,
        amountField: 'mobile_rate',
        fee: planMonthlyFee,
        speed,
        line: policy.monthlyFees.length,
        label: '프리미엄 가족 추가회선 할인율',
        allowedServices: ['MOBILE', 'ALL'],
        allowedScopes: ['ADDITIONAL', 'LINE'],
        allowedFeeBases: ['LINE_MONTHLY_FEE'],
        allowedRuleTypes: ['RATE', 'PREMIUM_FAMILY'],
        // 견적 모드에서는 DB 자유문장을 임의 해석하지 않고, 이미 구조화된
        // 요금·회선·베이스 회선 조건으로만 추가 회선 자격을 확인합니다.
        allowCustomerCondition: !strictBundleValidation,
      }));
      if (hasValue(rateRule.customer_condition)) {
        bundleValidationNotes.push(
          `프리미엄 가족 추가회선 규칙 ${rateRule.id ?? '(id 없음)'}의 customer_condition은 자유문장이어서 자동 검증하지 않았습니다. 견적 모드에서는 구조화된 요금·회선·베이스 회선 조건으로 계산했습니다.`,
        );
      }
      baseMobileDiscount = Math.round(
        planMonthlyFee *
          normalizeDbRate(rateRule.mobile_rate, 'bundle_rules.mobile_rate'),
      );
    } else if (policy.premiumBaseMethod === 'FIXED') {
      const mobileRule = fixedMobileRule({
        fee: planMonthlyFee,
        line: policy.monthlyFees.length,
        method: 'FIXED',
        label: '프리미엄 가족 베이스 정액할인',
      });
      baseMobileDiscount = Math.round(
        nonNegative(
          mobileRule.mobile_discount,
          'bundle_rules.mobile_discount',
        ) * factor,
      );
      baseGroupInternetRule = optionalInternetRule({
        fee: baseLineFee,
        line: policy.monthlyFees.length,
        method: 'FIXED',
        label: '프리미엄 가족 베이스 정액 인터넷 할인',
      });
      baseGroupInternetDiscount = baseGroupInternetRule
        ? Math.round(
            nonNegative(
              baseGroupInternetRule.internet_discount,
              'bundle_rules.internet_discount',
            ) * factor,
          )
        : 0;
    } else {
      matchMetricName = 'premium_base_group_monthly_total';
      matchMetricValue = baseGroupTotal;
      const poolRule = fixedMobileRule({
        fee: baseGroupTotal,
        line: policy.monthlyFees.length,
        method: 'TOTAL',
        label: '프리미엄 가족 베이스 총액할인 풀',
      });
      const mobilePool = Math.round(
        nonNegative(
          poolRule.mobile_discount,
          'bundle_rules.mobile_discount',
        ) * factor,
      );
      baseMobileDiscount = allocateTotalMobileDiscount({
        mobilePool,
        monthlyFees: baseEligibleFees,
        lineOrders: baseEligibleLineOrders,
        targetLineOrder: policy.targetLineOrder,
        allocationMethod: policy.allocationMethod,
        designatedLineOrder: null,
      });
      baseGroupInternetRule = optionalInternetRule({
        fee: baseGroupTotal,
        line: policy.monthlyFees.length,
        method: 'TOTAL',
        label: '프리미엄 가족 베이스 총액 인터넷 할인',
      });
      baseGroupInternetDiscount = baseGroupInternetRule
        ? Math.round(
            nonNegative(
              baseGroupInternetRule.internet_discount,
              'bundle_rules.internet_discount',
            ) * factor,
          )
        : 0;
    }

    if (targetIsPremiumAdditionalLine) {
      const baseRuleMethod = policy.premiumBaseMethod;
      baseGroupInternetRule = optionalInternetRule({
        fee: baseRuleMethod === 'TOTAL' ? baseGroupTotal : baseLineFee,
        line: policy.monthlyFees.length,
        method: baseRuleMethod,
        label:
          baseRuleMethod === 'TOTAL'
            ? '프리미엄 가족 베이스 총액 인터넷 할인'
            : '프리미엄 가족 베이스 정액 인터넷 할인',
      });
      baseGroupInternetDiscount = baseGroupInternetRule
        ? Math.round(
            nonNegative(
              baseGroupInternetRule.internet_discount,
              'bundle_rules.internet_discount',
            ) * factor,
          )
        : 0;
    }

    if (policy.baseInternetDiscountEligible && !baseGroupInternetRule) {
      const message =
        '프리미엄 가족결합의 인터넷 할인 규칙이 없습니다. 동일 bundle_id에 베이스 방식(FIXED/TOTAL)의 internet_discount 규칙을 추가하세요.';
      if (strictBundleValidation) throw new Error(message);
      bundleValidationNotes.push(
        `${message} 견적 모드에서는 인터넷 할인분을 0원으로 두고 계산했습니다.`,
      );
      baseGroupInternetDiscount = 0;
    }

    if (
      policy.premiumBaseInternetDiscountTarget === 'BASE_MOBILE' &&
      policy.targetLineOrder === policy.baseLineOrder
    ) {
      baseMobileDiscount += baseGroupInternetDiscount;
      if (baseGroupInternetRule?.id) {
        referenceRuleIds.delete(baseGroupInternetRule.id);
        mobileAppliedRuleIds.add(baseGroupInternetRule.id);
      }
      internetDiscountReference = 0;
    } else {
      internetDiscountReference = baseGroupInternetDiscount;
    }

    if (policy.youthDiscount > 0) {
      const youthRule = useRule(selectUniqueDbRule({
        rules,
        amountField: 'extra_discount',
        fee: planMonthlyFee,
        speed,
        line: policy.monthlyFees.length,
        label: '프리미엄 청소년 추가할인',
        allowCustomerCondition: true,
        allowedServices: ['MOBILE', 'ALL'],
        allowedScopes: ['YOUTH', 'ADDITIONAL', 'LINE'],
        allowedFeeBases: ['LINE_MONTHLY_FEE'],
        allowedRuleTypes: ['ADDON'],
        requireYouthMarker: true,
      }));
      youthDiscount = nonNegative(
        youthRule.extra_discount,
        'bundle_rules.extra_discount',
      );
    }
  }

  return {
    ...policy,
    source: 'DATABASE',
    bundleId: bundle.id,
    bundleName: bundle.name ?? null,
    parentBundleId: parentBundle?.id ?? null,
    parentBundleName: parentBundle?.name ?? null,
    bundleDiscountMethod: bundle.discount_method ?? null,
    appliedRuleIds: [...mobileAppliedRuleIds],
    matchedRuleIds: [...matchedRuleIds],
    referenceRuleIds: [...referenceRuleIds],
    matchMetricName,
    matchMetricValue,
    baseMobileDiscount,
    youthDiscount,
    mobileDiscount: baseMobileDiscount + youthDiscount,
    internetDiscountReference,
    bundleEligibilityFullyVerified: bundleValidationNotes.length === 0,
    bundleValidationNotes,
  };
}

function detectDeviceCategory(product) {
  const maker = String(product.maker ?? '').trim().toLowerCase();
  const productName = String(product.product_name ?? '').trim().toLowerCase();
  const isGalaxy =
    maker.includes('samsung') ||
    maker.includes('삼성') ||
    productName.includes('galaxy') ||
    productName.includes('갤럭시');
  const isIphone =
    maker.includes('apple') ||
    maker.includes('애플') ||
    productName.includes('iphone') ||
    productName.includes('아이폰');

  if (isGalaxy && isIphone) return 'AMBIGUOUS';
  if (isGalaxy) return 'GALAXY';
  if (isIphone) return 'IPHONE';
  return 'OTHER';
}

function normalizedProductName(productName) {
  return String(productName ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/갤럭시/g, 'galaxy')
    .replace(/아이폰/g, 'iphone')
    .replace(/프로/g, 'pro')
    .replace(/맥스/g, 'max')
    .replace(/울트라/g, 'ultra')
    .replace(/플러스/g, 'plus')
    .replace(/플립/g, 'flip')
    .replace(/폴드/g, 'fold')
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9가-힣]/g, '');
}

function canonicalDeviceModel(product, deviceCategory) {
  let normalizedName = normalizedProductName(product.product_name)
    .replace(/\d+(?:gb|tb)$/i, '');

  if (deviceCategory === 'GALAXY') {
    normalizedName = normalizedName
      .replace(/^samsung/, '')
      .replace(/^galaxy/, '');
  } else if (deviceCategory === 'IPHONE') {
    normalizedName = normalizedName.replace(/^apple/, '');
  }

  return normalizedName;
}

function resolveDeviceDiscountPolicy(product, deviceCategory) {
  const modelName = canonicalDeviceModel(product, deviceCategory);

  for (const policyEntry of DEVICE_DISCOUNT_POLICIES) {
    const categoryMatches = policyEntry.category === deviceCategory;
    const modelMatches = policyEntry.tokens.includes(modelName);
    if (categoryMatches && modelMatches) {
      return policyEntry;
    }
  }

  // 준비된 시연 할인표에 포함되지 않은 모델입니다.
  if (
    deviceCategory === 'IPHONE' &&
    ['iphone18', 'iphone18plus'].includes(modelName)
  ) {
    throw Object.assign(new Error('선택한 단말기의 시연 할인표가 아직 등록되지 않았습니다.'),
      { code: 'PRICE_POLICY_UNAVAILABLE' });
  }

  throw Object.assign(new Error('등록된 단말 할인 정책이 없는 기종입니다.'),
    { code: 'PRICE_POLICY_UNAVAILABLE' });
}

function won(value) {
  return Math.round(value);
}

function displayWon(value, { monthly = false, discount = false } = {}) {
  const rounded = won(value);
  const prefix = monthly ? '월 ' : '';
  const sign = discount && rounded > 0 ? '-' : '';
  return `${prefix}${sign}${Math.abs(rounded).toLocaleString('ko-KR')}원`;
}

function calculateInstallmentSchedule(principal, months, annualRate) {
  if (principal === 0) {
    return {
      annualRate: 0,
      regularMonthlyPayment: 0,
      lastMonthlyPayment: 0,
      totalRepayment: 0,
      totalInterest: 0,
    };
  }

  // 할부개월 1은 일시불로 보고 할부 수수료를 적용하지 않습니다.
  if (months === 1) {
    return {
      annualRate: 0,
      regularMonthlyPayment: principal,
      lastMonthlyPayment: principal,
      totalRepayment: principal,
      totalInterest: 0,
    };
  }

  const monthlyRate = annualRate / 12;
  const growth = Math.pow(1 + monthlyRate, months);
  const exactRegularPayment =
    principal * monthlyRate * growth / (growth - 1);
  const regularMonthlyPayment = Math.floor(exactRegularPayment);

  let remainingPrincipal = principal;
  let totalRepayment = 0;
  let totalInterest = 0;
  let lastMonthlyPayment = 0;

  for (let month = 1; month <= months; month += 1) {
    const monthlyInterest = Math.floor(remainingPrincipal * monthlyRate);
    const isLastMonth = month === months;
    const principalPayment = isLastMonth
      ? remainingPrincipal
      : Math.min(
          remainingPrincipal,
          Math.max(regularMonthlyPayment - monthlyInterest, 0),
        );
    const monthlyPayment = principalPayment + monthlyInterest;

    remainingPrincipal -= principalPayment;
    totalRepayment += monthlyPayment;
    totalInterest += monthlyInterest;

    if (isLastMonth) {
      lastMonthlyPayment = monthlyPayment;
    }
  }

  return {
    annualRate,
    regularMonthlyPayment,
    lastMonthlyPayment,
    totalRepayment,
    totalInterest,
  };
}

export function calculatePreparedQuote(currentInput) {
let calculation = currentInput.calculation ?? Object.fromEntries(
  ['product_id', 'plan_id', 'bundle_id', 'installment_months', 'contract_months', 'discount_type']
    .filter(key => Object.prototype.hasOwnProperty.call(currentInput, key))
    .map(key => [key, currentInput[key]]),
);
if (typeof calculation === 'string') {
  try {
    calculation = JSON.parse(calculation);
  } catch {
    throw new Error('Postgres 조회 결과의 calculation JSON을 해석할 수 없습니다.');
  }
}

if (!calculation || Array.isArray(calculation) || typeof calculation !== 'object') {
  throw new Error('계산 조건이 올바른 JSON 객체가 아닙니다.');
}
if (currentInput.input_error) {
  throw new Error(String(currentInput.input_error));
}
if (Object.keys(calculation).length === 0) {
  throw new Error(
    '계산 조건이 비어 있습니다. Manual Trigger 다음에 테스트 입력 노드를 연결하고 샘플 JSON을 입력하세요.',
  );
}

const product = currentInput.product;
const plan = currentInput.plan;
const bundle = currentInput.bundle;
const parentBundle = currentInput.parent_bundle;
let bundleRules = currentInput.bundle_rules ?? [];
if (typeof bundleRules === 'string') {
  try {
    bundleRules = JSON.parse(bundleRules);
  } catch {
    throw new Error('Postgres 조회 결과의 bundle_rules JSON을 해석할 수 없습니다.');
  }
}
if (!Array.isArray(bundleRules)) {
  throw new Error('Postgres 조회 결과의 bundle_rules는 배열이어야 합니다.');
}

if (!product || !hasValue(product.id) || !hasValue(product.price)) {
  throw new Error('상품 조회 결과가 없습니다. products.id와 product_id를 확인하세요.');
}
if (!plan || !hasValue(plan.id) || !hasValue(plan.monthly_fee)) {
  throw new Error('요금제 조회 결과가 없습니다. own_plans.id와 plan_id를 확인하세요.');
}

if (
  hasValue(calculation.upfront_payment) &&
  numberValue(calculation.upfront_payment, 'upfront_payment') !== 0
) {
  throw new Error('선납금은 사용하지 않습니다. 계산 조건에서 upfront_payment를 제거하세요.');
}
if (
  hasValue(calculation.installment_interest_total) &&
  numberValue(calculation.installment_interest_total, 'installment_interest_total') !== 0
) {
  throw new Error(
    '할부 수수료는 자동 계산됩니다. 계산 조건에서 installment_interest_total을 제거하세요.',
  );
}
if (hasValue(calculation.device_subsidy)) {
  throw new Error(
    '단말 할인액은 discount_type과 기종으로 자동 결정됩니다. device_subsidy를 제거하세요.',
  );
}
if (hasValue(calculation.selection_agreement)) {
  throw new Error(
    '선택약정 여부는 discount_type으로 자동 결정됩니다. selection_agreement를 제거하세요.',
  );
}

const productPrice = nonNegative(product.price, 'products.price');
const planMonthlyFee = nonNegative(plan.monthly_fee, 'own_plans.monthly_fee');
const installmentMonths = requiredPositiveInteger(
  calculation.installment_months,
  'installment_months',
);
if (!SUPPORTED_INSTALLMENT_MONTHS.includes(installmentMonths)) {
  throw new Error(
    `installment_months는 현재 ${SUPPORTED_INSTALLMENT_MONTHS.join(' 또는 ')}만 지원합니다. 일시불은 1, 할부는 24를 보내세요.`,
  );
}
const contractMonths = requiredPositiveInteger(
  calculation.contract_months,
  'contract_months',
);
const discountType = normalizeDiscountType(calculation.discount_type);
const deviceCategory = detectDeviceCategory(product);

if (contractMonths !== DEVICE_DISCOUNT_POLICY_CONTRACT_MONTHS) {
  throw new Error(
    `현재 등록된 단말 할인 정책은 ${DEVICE_DISCOUNT_POLICY_CONTRACT_MONTHS}개월 약정 기준입니다. contract_months를 확인하세요.`,
  );
}

// 기존 기종별 단말 할인표와 discount_type 분기를 그대로 유지합니다.
const deviceDiscountPolicy = resolveDeviceDiscountPolicy(product, deviceCategory);
const devicePolicyAvailable = true;
const devicePolicyNotes = planMonthlyFee === DEVICE_DISCOUNT_POLICY_PLAN_MONTHLY_FEE ? [] : [
  '기존 9만원 기준 기종별 단말 할인표를 선택 요금제에도 그대로 적용한 시연 계산입니다.',
];

let commonDeviceDiscount = 0;
const additionalDeviceDiscount = deviceDiscountPolicy.additional;
let selectionAgreement = false;

if (discountType === 'DEVICE_DISCOUNT') {
  commonDeviceDiscount = deviceDiscountPolicy.common;
} else {
  selectionAgreement = true;
}

const totalDeviceDiscount = commonDeviceDiscount + additionalDeviceDiscount;
if (totalDeviceDiscount > productPrice) {
  throw new Error('총 단말 할인액이 단말 가격보다 큽니다.');
}

const selectionDiscountRate = selectionAgreement ? 0.25 : 0;
const selectionAgreementDiscount = planMonthlyFee * selectionDiscountRate;
calculation = injectDemoBundleConditions(calculation, planMonthlyFee, bundle, parentBundle);
const requestedBundleId = String(calculation.bundle_id ?? '').trim();
let bundleCalculation;
if (requestedBundleId) {
  bundleCalculation = resolveDatabaseBundleDiscount(
    calculation,
    planMonthlyFee,
    bundle,
    parentBundle,
    bundleRules,
  );
} else {
  const requestedMobileBundleType = normalizeMobileBundleType(
    calculation.mobile_bundle_type,
  );
  if (requestedMobileBundleType !== 'NONE') {
    throw new Error(
      '결합할인을 적용하려면 bundle_id가 필요합니다. bundles.id를 입력하세요.',
    );
  }
  bundleCalculation = {
    ...resolveMobileBundleDiscount(calculation, planMonthlyFee),
    source: 'NONE',
    bundleId: null,
    bundleName: null,
    parentBundleId: null,
    parentBundleName: null,
    bundleDiscountMethod: null,
    appliedRuleIds: [],
    matchedRuleIds: [],
    referenceRuleIds: [],
    matchMetricName: null,
    matchMetricValue: null,
  };
}
const mobileBundleDiscount = Math.min(
  bundleCalculation.mobileDiscount,
  Math.max(planMonthlyFee - selectionAgreementDiscount, 0),
);
const planFeeAfterDiscount = Math.max(
  planMonthlyFee - selectionAgreementDiscount - mobileBundleDiscount,
  0,
);

const financedPrincipal = productPrice - totalDeviceDiscount;
const installmentSchedule = calculateInstallmentSchedule(
  financedPrincipal,
  installmentMonths,
  KT_INSTALLMENT_ANNUAL_RATE,
);

const monthlyPaymentDuringInstallment =
  installmentSchedule.regularMonthlyPayment + planFeeAfterDiscount;
const lastInstallmentMonthPayment =
  installmentSchedule.lastMonthlyPayment + planFeeAfterDiscount;
const totalEffectiveCost =
  installmentSchedule.totalRepayment + planFeeAfterDiscount * contractMonths;
const averageMonthlyEffectivePrice = totalEffectiveCost / contractMonths;
const selectionAgreementDiscountContractTotal =
  selectionAgreementDiscount * contractMonths;
const mobileBundleDiscountContractTotal =
  mobileBundleDiscount * contractMonths;
const totalContractDiscountBenefit =
  totalDeviceDiscount +
  selectionAgreementDiscountContractTotal +
  mobileBundleDiscountContractTotal;
const productDisplayName = product.product_name ?? String(product.id);
const planDisplayName = plan.plan_name ?? String(plan.id);
const isCashPayment = installmentMonths === 1;
const expectedPaymentDisplay = isCashPayment
  ? `첫 달 ${displayWon(monthlyPaymentDuringInstallment)}`
  : displayWon(monthlyPaymentDuringInstallment, { monthly: true });
const devicePaymentLabel = isCashPayment
  ? '일시불 단말금'
  : '월 단말 할부금';
const devicePaymentDisplay = displayWon(
  installmentSchedule.regularMonthlyPayment,
  { monthly: !isCashPayment },
);
const planPaymentDisplay = displayWon(planFeeAfterDiscount, { monthly: true });
const devicePaymentAmountDisplay = displayWon(
  installmentSchedule.regularMonthlyPayment,
);
const planPaymentAmountDisplay = displayWon(planFeeAfterDiscount);
const calculationExplanation = isCashPayment
  ? `${productDisplayName} · ${planDisplayName} · 일시불 기준 첫 달 예상 납부금액입니다. 일시불 단말금 ${devicePaymentAmountDisplay}과 할인 후 월 통신요금 ${planPaymentAmountDisplay}을 합산했습니다. 다음 달부터는 단말금 없이 할인 후 통신요금만 납부합니다.`
  : `${productDisplayName} · ${planDisplayName} · ${installmentMonths}개월 할부 기준 예상 월 납부금액입니다. 월 단말 할부금 ${devicePaymentAmountDisplay}과 할인 후 월 통신요금 ${planPaymentAmountDisplay}을 합산했습니다.`;
const installmentFeeExplanation =
  installmentSchedule.totalInterest > 0
    ? `단말 할부수수료 ${displayWon(installmentSchedule.totalInterest)}을 포함한`
    : '단말 할부수수료 없이 산정한';
const effectivePriceExplanation =
  `고객님의 예상 납부금액은 ${expectedPaymentDisplay}입니다. ` +
  `${contractMonths}개월 동안 이번 견적에 반영된 단말·선택약정·모바일 결합 할인으로 총 ${displayWon(totalContractDiscountBenefit)}의 혜택을 받습니다. ` +
  `${installmentFeeExplanation} 약정기간 예상 총 납부액(총 체감가)은 ${displayWon(totalEffectiveCost)}이며, 이를 약정기간으로 나눈 월평균 체감가는 ${displayWon(averageMonthlyEffectivePrice, { monthly: true })}입니다.`;

return [
  {
    json: {
      currency: 'KRW',
      quote_type: 'pure_calculation',
      product_id: product.id,
      product_name: product.product_name ?? null,
      plan_id: plan.id,
      plan_name: plan.plan_name ?? null,
      bundle_id: bundleCalculation.bundleId,
      bundle_name: bundleCalculation.bundleName,
      calculation_basis: {
        installment_months: installmentMonths,
        contract_months: contractMonths,
        installment_annual_rate: installmentSchedule.annualRate,
        discount_type: discountType,
        device_category: deviceCategory,
        device_model_policy: deviceDiscountPolicy.code,
        device_discount_policy_available: devicePolicyAvailable,
        device_discount_policy_notes: devicePolicyNotes,
        quote_is_estimate: devicePolicyNotes.length > 0 || Object.keys(calculation.bundle_demo_assumptions ?? {}).length > 0,
        bundle_application_status: bundleCalculation.applicationStatus ?? (requestedBundleId ? 'APPLIED' : 'NONE'),
        bundle_application_reason: bundleCalculation.applicationReason ?? null,
        device_discount_policy_effective_date:
          DEVICE_DISCOUNT_POLICY_EFFECTIVE_DATE,
        device_discount_policy_plan_monthly_fee:
          DEVICE_DISCOUNT_POLICY_PLAN_MONTHLY_FEE,
        device_discount_policy_contract_months:
          DEVICE_DISCOUNT_POLICY_CONTRACT_MONTHS,
        common_device_discount: commonDeviceDiscount,
        additional_device_discount: additionalDeviceDiscount,
        selection_agreement: selectionAgreement,
        selection_discount_rate: selectionDiscountRate,
        bundle_policy_effective_date:
          bundleCalculation.source === 'DATABASE'
            ? null
            : KT_BUNDLE_POLICY_EFFECTIVE_DATE,
        bundle_source: bundleCalculation.source,
        parent_bundle_id: bundleCalculation.parentBundleId,
        parent_bundle_name: bundleCalculation.parentBundleName,
        bundle_discount_method:
          bundleCalculation.bundleDiscountMethod,
        applied_bundle_rule_ids:
          bundleCalculation.appliedRuleIds,
        matched_bundle_rule_ids:
          bundleCalculation.matchedRuleIds,
        reference_bundle_rule_ids:
          bundleCalculation.referenceRuleIds,
        bundle_rule_match_metric:
          bundleCalculation.matchMetricName,
        bundle_rule_match_value:
          bundleCalculation.matchMetricValue,
        bundle_eligibility_fully_verified:
          bundleCalculation.bundleEligibilityFullyVerified ?? true,
        bundle_validation_notes:
          bundleCalculation.bundleValidationNotes ?? [],
        eligibility_source: Object.keys(calculation.bundle_demo_assumptions ?? {}).length ? 'DEMO_ASSUMPTIONS' : 'REQUEST',
        bundle_demo_assumptions: calculation.bundle_demo_assumptions ?? {},
        household_bundle_type: bundleCalculation.householdBundleType,
        mobile_bundle_type: bundleCalculation.mobileBundleType,
        internet_tier: bundleCalculation.internetTier,
        internet_product_type: bundleCalculation.internetProductType,
        base_internet_discount_eligible:
          bundleCalculation.baseInternetDiscountEligible,
        internet_contract_months:
          bundleCalculation.internetContractMonths,
        internet_contract_discount_factor:
          bundleCalculation.internetContractDiscountFactor,
        family_eligible: bundleCalculation.familyEligible,
        family_mobile_monthly_fees: bundleCalculation.monthlyFees,
        family_mobile_monthly_total:
          bundleCalculation.familyMonthlyTotal,
        mobile_line_count: bundleCalculation.monthlyFees.length,
        mobile_line_order: bundleCalculation.targetLineOrder,
        base_mobile_line_order: bundleCalculation.baseLineOrder,
        premium_eligible_line_count:
          bundleCalculation.premiumEligibleLineCount,
        bundle_allocation_method: bundleCalculation.allocationMethod,
        premium_family_base_method:
          bundleCalculation.premiumBaseMethod,
        premium_base_internet_discount_target:
          bundleCalculation.premiumBaseInternetDiscountTarget,
        premium_family_25_percent_active:
          bundleCalculation.premiumFamily25PercentActive,
        premium_family_fallback_applied:
          bundleCalculation.premiumFamilyFallbackApplied,
      },
      result: {
        '계산 설명': calculationExplanation,
        '계산 유의사항': [...devicePolicyNotes, ...(bundleCalculation.bundleValidationNotes ?? [])],
        '예상 납부금액': expectedPaymentDisplay,
        '금액 구성': {
          [devicePaymentLabel]: devicePaymentDisplay,
          '할인 후 월 통신요금': planPaymentDisplay,
        },
        '적용 할인': {
          '할인 방식':
            discountType === 'PLAN_DISCOUNT' ? '요금할인' : '단말할인',
          '단말 할인 총액': displayWon(totalDeviceDiscount, {
            discount: true,
          }),
          '선택약정 월 할인': displayWon(selectionAgreementDiscount, {
            discount: true,
          }),
          '모바일 결합 월 할인': displayWon(mobileBundleDiscount, {
            discount: true,
          }),
        },
        '고객 체감가': {
          '체감가 안내': effectivePriceExplanation,
          '약정기간 총 할인 혜택': displayWon(
            totalContractDiscountBenefit,
          ),
          '단말 할부수수료 총액': displayWon(
            installmentSchedule.totalInterest,
          ),
          '약정기간 총 체감가': displayWon(totalEffectiveCost),
          '월평균 체감가': displayWon(averageMonthlyEffectivePrice, {
            monthly: true,
          }),
        },
        ...(isCashPayment
          ? {
              '다음 달부터 예상 납부금액': planPaymentDisplay,
            }
          : {}),
      },
      raw_result: {
        monthly_payment_during_installment: won(monthlyPaymentDuringInstallment),
        last_installment_month_payment: won(lastInstallmentMonthPayment),
        monthly_payment_after_installment: won(planFeeAfterDiscount),
        average_monthly_effective_price: won(averageMonthlyEffectivePrice),
        total_effective_cost: won(totalEffectiveCost),
        total_contract_discount_benefit: won(totalContractDiscountBenefit),
      },
      breakdown: {
        product_price: won(productPrice),
        common_device_discount: won(commonDeviceDiscount),
        additional_device_discount: won(additionalDeviceDiscount),
        total_device_discount: won(totalDeviceDiscount),
        financed_principal: won(financedPrincipal),
        installment_interest_total: won(installmentSchedule.totalInterest),
        installment_repayment_total: won(installmentSchedule.totalRepayment),
        monthly_device_installment: won(installmentSchedule.regularMonthlyPayment),
        last_month_device_installment: won(installmentSchedule.lastMonthlyPayment),
        plan_monthly_fee: won(planMonthlyFee),
        selection_agreement_discount: won(selectionAgreementDiscount),
        selection_agreement_discount_contract_total: won(
          selectionAgreementDiscountContractTotal,
        ),
        target_mobile_bundle_discount_before_youth: won(
          bundleCalculation.baseMobileDiscount,
        ),
        premium_youth_additional_discount: won(
          bundleCalculation.youthDiscount,
        ),
        bundle_mobile_discount_applied: won(mobileBundleDiscount),
        bundle_mobile_discount_contract_total: won(
          mobileBundleDiscountContractTotal,
        ),
        group_internet_discount_reference: won(
          bundleCalculation.internetDiscountReference,
        ),
        plan_fee_after_discount: won(planFeeAfterDiscount),
      },
      excluded: {
        customer_lookup: true,
        bundle_mobile_discount: false,
        living_apart_internet_tv_additional_discount: true,
        upfront_payment: true,
        promotions: true,
        non_cash_benefits: true,
        internet_and_tv_fees: true,
      },
    },
  },
][0].json;
}
