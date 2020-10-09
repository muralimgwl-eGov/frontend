import { getCommonCaption, getCommonCard } from "egov-ui-framework/ui-config/screens/specs/utils";
import { setRoute } from "egov-ui-framework/ui-redux/app/actions";
import { handleScreenConfigurationFieldChange as handleField, prepareFinalObject } from "egov-ui-framework/ui-redux/screen-configuration/actions";
import { validate } from "egov-ui-framework/ui-redux/screen-configuration/utils";
import { httpRequest } from "egov-ui-framework/ui-utils/api";
import { getLocaleLabels, getQueryArg, getTransformedLocalStorgaeLabels } from "egov-ui-framework/ui-utils/commons";
import { getUserInfo } from "egov-ui-framework/ui-utils/localStorageUtils";
import get from "lodash/get";
import set from "lodash/set";
import { toggleSnackbar } from "egov-ui-framework/ui-redux/screen-configuration/actions";



export const getCommonApplyFooter = children => {
  return {
    uiFramework: "custom-atoms",
    componentPath: "Div",
    props: {
      className: "apply-wizard-footer"
    },
    children
  };
};

export const transformById = (payload, id) => {
  return (
    payload &&
    payload.reduce((result, item) => {
      result[item[id]] = {
        ...item
      };

      return result;
    }, {})
  );
};

export const getTranslatedLabel = (labelKey, localizationLabels) => {
  let translatedLabel = null;
  if (localizationLabels && localizationLabels.hasOwnProperty(labelKey)) {
    translatedLabel = localizationLabels[labelKey];
    if (
      translatedLabel &&
      typeof translatedLabel === "object" &&
      translatedLabel.hasOwnProperty("message")
    )
      translatedLabel = translatedLabel.message;
  }
  return translatedLabel || labelKey;
};

export const validateFields = (
  objectJsonPath,
  state,
  dispatch,
  screen = "apply"
) => {
  const fields = get(
    state.screenConfiguration.screenConfig[screen],
    objectJsonPath,
    {}
  );
  let isFormValid = true;
  for (var variable in fields) {
    if (fields.hasOwnProperty(variable)) {
      if (
        fields[variable] && fields[variable].componentPath != "DynamicMdmsContainer" && 
        fields[variable].props &&
        (fields[variable].props.disabled === undefined ||
          !fields[variable].props.disabled) &&
        !validate(
          screen,
          {
            ...fields[variable],
            value: get(
              state.screenConfiguration.preparedFinalObject,
              fields[variable].jsonPath
            )
          },
          dispatch,
          true
        )
      ) {
        isFormValid = false;
      } else if(fields[variable] && fields[variable].componentPath == "DynamicMdmsContainer" && fields[variable].props){
        let {masterName, moduleName, rootBlockSub, dropdownFields} = fields[variable].props;
        let isIndex = fields[variable].index || 0;
        dropdownFields.forEach((item, i) => {
          let isValid = get(
            state.screenConfiguration.preparedFinalObject ,
            `DynamicMdms.${moduleName}.${rootBlockSub}.selectedValues[${isIndex}].${item.key}`,
            ''
          );
          if(!isValid || isValid == '' || isValid == 'none') {
            isFormValid = false;
            dispatch(
              handleField(
                screen,
                `${fields[variable].componentJsonpath}.props.dropdownFields[${i}]`,
                "isRequired",
                true
              )
            );
          }
        });
        
      }
    }
  }
  return isFormValid;
};

export const convertDateToEpoch = (dateString, dayStartOrEnd = "dayend") => {
  //example input format : "2018-10-02"
  try {
    const parts = dateString.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    const DateObj = new Date(Date.UTC(parts[1], parts[2] - 1, parts[3]));
    DateObj.setMinutes(DateObj.getMinutes() + DateObj.getTimezoneOffset());
    if (dayStartOrEnd === "dayend") {
      DateObj.setHours(DateObj.getHours() + 24);
      DateObj.setSeconds(DateObj.getSeconds() - 1);
    }
    return DateObj.getTime();
  } catch (e) {
    return dateString;
  }
};

export const getMdmsData = async queryObject => {
  try {
    const response = await httpRequest(
      "post",
      "egov-mdms-service/v1/_get",
      "",
      queryObject
    );
    return response;
  } catch (error) {
    console.log(error);
    return {};
  }
};

export const getEpochForDate = date => {
  if (typeof date === "string") {
    const dateSplit = date.split("/");
    return new Date(dateSplit[2], dateSplit[1] - 1, dateSplit[0]).getTime();
  }
};

export const sortByEpoch = (data, order) => {
  if (order) {
    return data.sort((a, b) => {
      return a[a.length - 1] - b[b.length - 1];
    });
  } else {
    return data.sort((a, b) => {
      return b[b.length - 1] - a[a.length - 1];
    });
  }
};

export const ifUserRoleExists = role => {
  let userInfo = JSON.parse(getUserInfo());
  const roles = get(userInfo, "roles");
  const roleCodes = roles ? roles.map(role => role.code) : [];
  if (roleCodes.indexOf(role) > -1) {
    return true;
  } else return false;
};

export const convertEpochToDate = dateEpoch => {
  const dateFromApi = new Date(dateEpoch);
  let month = dateFromApi.getMonth() + 1;
  let day = dateFromApi.getDate();
  let year = dateFromApi.getFullYear();
  month = (month > 9 ? "" : "0") + month;
  day = (day > 9 ? "" : "0") + day;
  return `${day}/${month}/${year}`;
};

export const getCurrentFinancialYear = () => {
  var today = new Date();
  var curMonth = today.getMonth();
  var fiscalYr = "";
  if (curMonth > 3) {
    var nextYr1 = (today.getFullYear() + 1).toString();
    fiscalYr = today.getFullYear().toString() + "-" + nextYr1;
  } else {
    var nextYr2 = today.getFullYear().toString();
    fiscalYr = (today.getFullYear() - 1).toString() + "-" + nextYr2;
  }
  return fiscalYr;
};

export const getFinancialYearDates = (format, et) => {
  /** Return the starting date and ending date (1st April to 31st March)
   *  of the financial year of the given date in ET. If no ET given then
   *  return the dates for the current financial year */
  var date = !et ? new Date() : new Date(et);
  var curMonth = date.getMonth();
  var financialDates = { startDate: "NA", endDate: "NA" };
  if (curMonth > 3) {
    switch (format) {
      case "dd/mm/yyyy":
        financialDates.startDate = `01/04/${date.getFullYear().toString()}`;
        financialDates.endDate = `31/03/${(date.getFullYear() + 1).toString()}`;
        break;
      case "yyyy-mm-dd":
        financialDates.startDate = `${date.getFullYear().toString()}-04-01`;
        financialDates.endDate = `${(date.getFullYear() + 1).toString()}-03-31`;
        break;
    }
  } else {
    switch (format) {
      case "dd/mm/yyyy":
        financialDates.startDate = `01/04/${(
          date.getFullYear() - 1
        ).toString()}`;
        financialDates.endDate = `31/03/${date.getFullYear().toString()}`;
        break;
      case "yyyy-mm-dd":
        financialDates.startDate = `${(
          date.getFullYear() - 1
        ).toString()}-04-01`;
        financialDates.endDate = `${date.getFullYear().toString()}-03-31`;
        break;
    }
  }
  return financialDates;
};

export const gotoApplyWithStep = (state, dispatch, step) => {
  const applicationNumber = getQueryArg(
    window.location.href,
    "applicationNumber"
  );
  const applicationNumberQueryString = applicationNumber
    ? `&applicationNumber=${applicationNumber}`
    : ``;
  const applyUrl =
    process.env.REACT_APP_SELF_RUNNING === "true"
      ? `/egov-ui-framework/abg/apply?step=${step}${applicationNumberQueryString}`
      : `/abg/apply?step=${step}${applicationNumberQueryString}`;
  dispatch(setRoute(applyUrl));
};

export const showHideAdhocPopup = (state, dispatch) => {
  let toggle = get(
    state.screenConfiguration.screenConfig["search"],
    "components.adhocDialog.props.open",
    false
  );
  dispatch(
    handleField("search", "components.adhocDialog", "props.open", !toggle)
  );
};

export const getCommonGrayCard = children => {
  return {
    uiFramework: "custom-atoms",
    componentPath: "Container",
    children: {
      body: {
        uiFramework: "custom-atoms",
        componentPath: "Div",
        children: {
          ch1: getCommonCard(children, {
            style: {
              backgroundColor: "rgb(242, 242, 242)",
              boxShadow: "none",
              borderRadius: 0,
              overflow: "visible"
            }
          })
        },
        gridDefination: {
          xs: 12
        }
      }
    },
    gridDefination: {
      xs: 12
    }
  };
};

export const getLabelOnlyValue = (value, props = {}) => {
  return {
    uiFramework: "custom-atoms",
    componentPath: "Div",
    gridDefination: {
      xs: 6,
      sm: 4
    },
    props: {
      style: {
        marginBottom: "16px"
      },
      ...props
    },
    children: {
      value: getCommonCaption(value)
    }
  };
};

export const getEmployeeName = async queryObject => {
  try {
    let employeeName = "";
    const payload = await httpRequest(
      "post",
      "/egov-hrms/employees/_search",
      "",
      queryObject
    );
    if (payload && payload.Employees && payload.Employees.length > 0) {
      employeeName = payload.Employees[0].user.name;
    }
    return employeeName;
  } catch (e) {
    console.log(e.message);
  }
};


export const getBill = async (queryObject,dispatch) => {
  try {
    const response = await httpRequest(
      "post",
      "/billing-service/bill/v2/_fetchbill",
      "",
      queryObject
    );
    return response;
  } catch (error) {
    dispatch(
      // toggleSnackbar(
      //   true,
      //   { labelName: error.message, labelKey: error.message },
      //   "error"
      // )
    );
    console.log(error,'fetxh');
  }
};


export const getBusinessServiceMdmsData = async (dispatch,  tenantId) => {

  let mdmsBody = {
    MdmsCriteria: {
      tenantId: tenantId,
      moduleDetails: [
        {
          moduleName: "BillingService",
          masterDetails: [{ name: "BusinessService" }]
        },
        {
          moduleName: "common-masters",
          masterDetails: [{ name: "uiCommonPay" }]
        }
      ]
    }
  };
  try {
    let payload = null;
    payload = await httpRequest(
      "post",
      "/egov-mdms-service/v1/_search",
      "_search",
      [],
      mdmsBody
    );
    dispatch(prepareFinalObject("businessServiceMdmsData", payload.MdmsRes));
  } catch (e) {
    console.log(e);
  }
};


// const generateBill = async (
//   consumerCode,
//   tenantId,
//   businessService,
//   dispatch
// ) => {
//   try {
//     const payload = await httpRequest(
//       "post",
//       `/billing-service/bill/_generate?consumerCode=${consumerCode}&businessService=${businessService}&tenantId=${tenantId}`,
//       "",
//       [],
//       {}
//     );
//     if (payload && payload.Bill[0]) {
//       dispatch(prepareFinalObject("ReceiptTemp[0].Bill", payload.Bill));
//       const estimateData = createEstimateData(payload.Bill[0]);
//       estimateData &&
//         estimateData.length &&
//         dispatch(
//           prepareFinalObject(
//             "applyScreenMdmsData.estimateCardData",
//             estimateData
//           )
//         );
//       dispatch(
//         prepareFinalObject("applyScreenMdmsData.consumerCode", consumerCode)
//       );
//       dispatch(
//         prepareFinalObject(
//           "applyScreenMdmsData.businessService",
//           businessService
//         )
//       );
//       dispatch(setRoute(`/uc/pay?tenantId=${tenantId}`));
//     }
//   } catch (e) {
//     console.log(e);
//   }
// };

// const createEstimateData = billObject => {
//   const billDetails = billObject && billObject.billDetails;
//   let fees =
//     billDetails &&
//     billDetails[0].billAccountDetails &&
//     billDetails[0].billAccountDetails.map(item => {
//       return {
//         name: { labelName: item.taxHeadCode, labelKey: item.taxHeadCode },
//         value: item.amount,
//         info: { labelName: item.taxHeadCode, labelKey: item.taxHeadCode }
//       };
//     });
//   return fees;
// };


export const createEstimateData = (billObject, totalAmount) => {
  let billDetails = billObject && billObject.billDetails;

  let forward = 0;
  if (totalAmount < 0) {
    billDetails.forEach(e => {
      e.billAccountDetails.forEach(cur => {
        if (cur.taxHeadCode.indexOf("ADVANCE_CARRYFORWARD") > -1) {
          forward = forward + cur.amount
        }
      });
    }); 

    let keyExist = false;
    billDetails[0].billAccountDetails.forEach(cur => {
      if (cur.taxHeadCode.indexOf("ADVANCE_CARRYFORWARD") > -1) {
        cur.amount = forward;
        keyExist = true;
      }
    });
    if(!keyExist){
      billDetails[0].billAccountDetails.push({
        amount: forward,
        taxHeadCode: "ADVANCE_CARRYFORWARD",
        order: 2,
        value: "Please put some description in mdms for this key"
      })
    }
  }

  let fees =
    billDetails &&
    billDetails[0].billAccountDetails &&
    billDetails[0].billAccountDetails.map(item => {
      return {
        name: { labelName: item.taxHeadCode, labelKey: item.taxHeadCode },
        value: item.amount,
        info: { labelName: item.taxHeadCode, labelKey: item.taxHeadCode }
      };
    });
  return fees;
};


export const generateBill = async (dispatch, consumerCode, tenantId, businessService) => {
  try {
    if (consumerCode && tenantId) {
      const queryObj = [
        {
          key: "tenantId",
          value: tenantId
        },
        {
          key: "consumerCode",
          value: consumerCode
        }
      ];
      if(businessService){
        queryObj.push({
          key: "businessService",
          value: businessService
        });
      }
      const payload = await getBill(queryObj,dispatch);
      // let payload = sampleGetBill();
      if (payload && payload.Bill[0]) {
        dispatch(prepareFinalObject("ReceiptTemp[0].Bill", payload.Bill));
        debugger;
        const estimateData = createEstimateData(payload.Bill[0], payload.Bill[0].totalAmount);
        estimateData &&
          estimateData.length &&
          dispatch(
            prepareFinalObject(
              "applyScreenMdmsData.estimateCardData",
              estimateData
            )
          );
      }
    }
  } catch (e) {
    dispatch(
      toggleSnackbar(
        true,
        { labelName: e.message, labelKey: e.message },
        "error"
      )
    );
    console.log(e);
  }
};



export const setServiceCategory = (businessServiceData, dispatch) => {
  let nestedServiceData = {};
  businessServiceData.forEach(item => {
    if (item.code && item.code.indexOf(".") > 0) {
      if (nestedServiceData[item.code.split(".")[0]]) {
        let child = get(
          nestedServiceData,
          `${item.code.split(".")[0]}.child`,
          []
        );
        child.push(item);
        set(nestedServiceData, `${item.code.split(".")[0]}.child`, child);
      } else {
        set(
          nestedServiceData,
          `${item.code.split(".")[0]}.code`,
          item.code.split(".")[0]
        );
        set(nestedServiceData, `${item.code.split(".")[0]}.child[0]`, item);
      }
    } else {
      set(nestedServiceData, `${item.code}`, item);
    }
  });
  dispatch(
    prepareFinalObject(
      "applyScreenMdmsData.nestedServiceData",
      nestedServiceData
    )
  );
  let serviceCategories = Object.values(nestedServiceData).filter(
    item => item.code
  );
  dispatch(
    prepareFinalObject(
      "applyScreenMdmsData.serviceCategories",
      serviceCategories
    )
  );
};

export const getTextToLocalMapping = label => {
  const localisationLabels = getTransformedLocalStorgaeLabels();
  switch (label) {
    case "Receipt No.":
      return getLocaleLabels(
        "Receipt No",
        "UC_COMMON_TABLE_COL_RECEIPT_NO",
        localisationLabels
      );
    case "Payee Name":
      return getLocaleLabels(
        "Consumer Name",
        "UC_COMMON_TABLE_COL_PAYEE_NAME",
        localisationLabels
      );
    case "Service Type":
      return getLocaleLabels(
        "Service Category",
        "UC_SERVICE_TYPE_LABEL",
        localisationLabels
      );
    case "Date":
      return getLocaleLabels(
        "Receipt Date",
        "UC_COMMON_TABLE_COL_DATE",
        localisationLabels
      );
    case "Amount[INR]":
      return getLocaleLabels(
        "Amount Paid[INR]",
        "UC_COMMON_TABLE_COL_AMOUNT",
        localisationLabels
      );
    case "Status":
      return getLocaleLabels(
        "Status",
        "UC_COMMON_TABLE_COL_STATUS",
        localisationLabels
      );
    case "BILLINGSERVICE_BUSINESSSERVICE_PT":
      return getLocaleLabels(
        "Property Tax",
        "BILLINGSERVICE_BUSINESSSERVICE_PT",
        localisationLabels
      );
    default:
      return getLocaleLabels(
        label,
        label,
        localisationLabels
      );
  }
};
