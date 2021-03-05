import {
  getCommonCard,


  getCommonContainer, getCommonGrayCard, getCommonHeader,




  getCommonSubHeader, getCommonTitle,



  getLabel
} from "egov-ui-framework/ui-config/screens/specs/utils";
import { handleScreenConfigurationFieldChange as handleField, prepareFinalObject, unMountScreen } from "egov-ui-framework/ui-redux/screen-configuration/actions";
import { getQueryArg, setBusinessServiceDataToLocalStorage, setDocuments } from "egov-ui-framework/ui-utils/commons";
import { loadUlbLogo } from "egov-ui-kit/utils/pdfUtils/generatePDF";
import get from "lodash/get";
import set from "lodash/set";
import { findAndReplace, getDescriptionFromMDMS, getSearchResults, getSearchResultsForSewerage, getWaterSource, getWorkFlowData, isModifyMode, serviceConst, swEstimateCalculation, waterEstimateCalculation } from "../../../../ui-utils/commons";
import {
  convertDateToEpoch, createEstimateData,
  getDialogButton, getFeesEstimateOverviewCard,
  getTransformedStatus, showHideAdhocPopup
} from "../utils";
import { downloadPrintContainer } from "../wns/acknowledgement";
import { adhocPopup } from "./applyResource/adhocPopup";
import { getReviewDocuments } from "./applyResource/review-documents";
import { getReviewOwner } from "./applyResource/review-owner";
import { getReviewConnectionDetails } from "./applyResource/review-trade";
import { snackbarWarningMessage } from "./applyResource/reviewConnectionDetails";
import { reviewModificationsEffective } from "./applyResource/reviewModificationsEffective";

const tenantId = getQueryArg(window.location.href, "tenantId");
let applicationNumber = getQueryArg(window.location.href, "applicationNumber");
let service = getQueryArg(window.location.href, "service");
let serviceModuleName = service === serviceConst.WATER ? "NewWS1" : "NewSW1";
let serviceUrl = serviceModuleName === "NewWS1" ? "/ws-services/wc/_update" : "/sw-services/swc/_update";
let redirectQueryString = `applicationNumber=${applicationNumber}&tenantId=${tenantId}`;
let editredirect = `apply?${redirectQueryString}&action=edit`;
let headerLabel = "WS_TASK_DETAILS"

const resetData = () => {
  applicationNumber = getQueryArg(window.location.href, "applicationNumber");
  service = getQueryArg(window.location.href, "service");
  serviceModuleName = service === serviceConst.WATER ? "NewWS1" : "NewSW1";
  serviceUrl = serviceModuleName === "NewWS1" ? "/ws-services/wc/_update" : "/sw-services/swc/_update";
  redirectQueryString = `applicationNumber=${applicationNumber}&tenantId=${tenantId}`;
  editredirect = `apply?${redirectQueryString}&action=edit`;
  if (isModifyMode()) {
    redirectQueryString += '&mode=MODIFY';
    editredirect += '&mode=MODIFY&modeaction=edit';
    if (service === serviceConst.WATER) {
      headerLabel = "WS_MODIFY_TASK_DETAILS"
    } else {
      headerLabel = "SW_MODIFY_TASK_DETAILS"
    }
  }

}



const headerrow = getCommonContainer({
  header: getCommonHeader({
    labelKey: headerLabel
  }),
  application: getCommonContainer({
    applicationNumber: {
      uiFramework: "custom-atoms-local",
      moduleName: "egov-wns",
      componentPath: "ApplicationNoContainer",
      props: {
        number: getQueryArg(window.location.href, "applicationNumber")
      }
    }
  }),
  connection: getCommonContainer({
    connectionNumber: {
      uiFramework: "custom-atoms-local",
      moduleName: "egov-wns",
      componentPath: "ConsumerNoContainer",
      props: {
        number: ""
      }
    }

  })
});

const beforeInitFn = async (action, state, dispatch, applicationNumber) => {
  // dispatch(handleField("apply",
  // "components",
  // "div", {}));
  // dispatch(handleField("search",
  // "components",
  // "div", {}));
  dispatch(unMountScreen("apply"));
  dispatch(unMountScreen("search"));
  dispatch(prepareFinalObject("WaterConnection",[]));
  dispatch(prepareFinalObject("SewerageConnection",[]));
  dispatch(prepareFinalObject("WaterConnectionOld",[]));
  dispatch(prepareFinalObject("SewerageConnectionOld",[]));
  const queryObj = [
    { key: "businessIds", value: applicationNumber },
    { key: "history", value: true },
    { key: "tenantId", value: tenantId }
  ];
  if (getQueryArg(window.location.href, "service", null) != null) {
    resetData();
  }

  let Response = await getWorkFlowData(queryObj);
  let processInstanceAppStatus = Response.ProcessInstances[0].state.applicationStatus;
  //Search details for given application Number
  if (applicationNumber) {

    // hiding the Additional details for citizen. ,,
    if (process.env.REACT_APP_NAME === "Citizen" && processInstanceAppStatus && (processInstanceAppStatus === 'INITIATED' || processInstanceAppStatus === "PENDING_FOR_CITIZEN_ACTION" || processInstanceAppStatus === 'PENDING_FOR_DOCUMENT_VERIFICATION')) {
      set(
        action.screenConfig, "components.div.children.taskDetails.children.cardContent.children.reviewOwnerDetails.props.style",
        { display: "none" }
      );
    }

    if (!getQueryArg(window.location.href, "edited")) {
      (await searchResults(action, state, dispatch, applicationNumber, processInstanceAppStatus));
    } else {
      let applyScreenObject = get(state.screenConfiguration.preparedFinalObject, "applyScreen");
      applyScreenObject.applicationNo.includes("WS") ? applyScreenObject.service = serviceConst.WATER : applyScreenObject.service = serviceConst.SEWERAGE;
      let parsedObject = parserFunction(findAndReplace(applyScreenObject, "NA", null));
      dispatch(prepareFinalObject("WaterConnection[0]", parsedObject));
      if (applyScreenObject.service = serviceConst.SEWERAGE)
        dispatch(prepareFinalObject("SewerageConnection[0]", parsedObject));
      let estimate;
      if (processInstanceAppStatus === "CONNECTION_ACTIVATED") {
        let connectionNumber = parsedObject.connectionNo;
        set(action.screenConfig, "components.div.children.headerDiv.children.header1.children.connection.children.connectionNumber.props.number", connectionNumber);
      } else {
        set(action.screenConfig, "components.div.children.headerDiv.children.header1.children.connection.children.connectionNumber.visible", false);
      }
      if (processInstanceAppStatus === "PENDING_FOR_FIELD_INSPECTION") {
        let queryObjectForEst = [{
          applicationNo: applicationNumber,
          tenantId: tenantId,
          waterConnection: parsedObject
        }]
        if (parsedObject.applicationNo.includes("WS")) {
          estimate = await waterEstimateCalculation(queryObjectForEst, dispatch);
          let viewBillTooltip = [];
          if (estimate !== null && estimate !== undefined) {
            if (estimate.Calculation.length > 0) {
              await processBills(estimate, viewBillTooltip, dispatch);
              // viewBreakUp 
              estimate.Calculation[0].billSlabData = _.groupBy(estimate.Calculation[0].taxHeadEstimates, 'category')
              estimate.Calculation[0].appStatus = processInstanceAppStatus;
              dispatch(prepareFinalObject("dataCalculation", estimate.Calculation[0]));
            }
          }
        } else {
          let queryObjectForEst = [{
            applicationNo: applicationNumber,
            tenantId: tenantId,
            sewerageConnection: parsedObject
          }]
          estimate = await swEstimateCalculation(queryObjectForEst, dispatch);
          let viewBillTooltip = []
          if (estimate !== null && estimate !== undefined) {
            if (estimate.Calculation.length > 0) {
              await processBills(estimate, viewBillTooltip, dispatch);
              // viewBreakUp 
              estimate.Calculation[0].billSlabData = _.groupBy(estimate.Calculation[0].taxHeadEstimates, 'category')
              estimate.Calculation[0].appStatus = processInstanceAppStatus;
              dispatch(prepareFinalObject("dataCalculation", estimate.Calculation[0]));
            }
          }
        }
        if (estimate !== null && estimate !== undefined) {
          createEstimateData(estimate.Calculation[0].taxHeadEstimates, "taxHeadEstimates", dispatch, {}, {});
        }
      }
    }


    let connectionType = get(state, "screenConfiguration.preparedFinalObject.WaterConnection[0].connectionType");
    if (connectionType === "Metered") {
      set(
        action.screenConfig,
        "components.div.children.taskDetails.children.cardContent.children.reviewOwnerDetails.children.cardContent.children.viewTwelve.children.reviewMeterId.visible",
        true
      );
      set(
        action.screenConfig,
        "components.div.children.taskDetails.children.cardContent.children.reviewOwnerDetails.children.cardContent.children.viewTwelve.children.reviewMeterInstallationDate.visible",
        true
      );
      set(
        action.screenConfig,
        "components.div.children.taskDetails.children.cardContent.children.reviewOwnerDetails.children.cardContent.children.viewTwelve.children.reviewInitialMeterReading.visible",
        true
      );
    } else {
      set(
        action.screenConfig,
        "components.div.children.taskDetails.children.cardContent.children.reviewOwnerDetails.children.cardContent.children.viewTwelve.children.reviewMeterId.visible",
        false
      );
      set(
        action.screenConfig,
        "components.div.children.taskDetails.children.cardContent.children.reviewOwnerDetails.children.cardContent.children.viewTwelve.children.reviewMeterInstallationDate.visible",
        false
      );
      set(
        action.screenConfig,
        "components.div.children.taskDetails.children.cardContent.children.reviewOwnerDetails.children.cardContent.children.viewTwelve.children.reviewInitialMeterReading.visible",
        false
      );
    }

    if (isModifyMode()) {
      set(
        action.screenConfig,
        "components.div.children.taskDetails.children.cardContent.children.estimate.visible",
        false
      );
      set(
        action.screenConfig,
        "components.div.children.taskDetails.children.cardContent.children.reviewOwnerDetails.children.cardContent.children.viewSeven.visible",
        false
      );
      set(
        action.screenConfig,
        "components.div.children.taskDetails.children.cardContent.children.reviewOwnerDetails.children.cardContent.children.viewEight.visible",
        false
      );
      set(
        action.screenConfig,
        "components.div.children.taskDetails.children.cardContent.children.reviewOwnerDetails.children.cardContent.children.viewNine.visible",
        false
      );
      set(
        action.screenConfig,
        "components.div.children.taskDetails.children.cardContent.children.reviewOwnerDetails.children.cardContent.children.viewTen.visible",
        false
      );
    } else {
      set(
        action.screenConfig,
        "components.div.children.taskDetails.children.cardContent.children.reviewModificationsDetails.visible",
        false
      );
    }

    const status = getTransformedStatus(
      get(state, "screenConfiguration.preparedFinalObject.WaterConnection[0].applicationStatus")
    );
    if (process.env.REACT_APP_NAME !== "Citizen" && (processInstanceAppStatus !== 'PENDING_FOR_PAYMENT' && processInstanceAppStatus !== "PENDING_FOR_CONNECTION_ACTIVATION" && processInstanceAppStatus !== 'CONNECTION_ACTIVATED')) {

      dispatch(
        handleField(
          "search-preview",
          "components.div.children.taskDetails.children.cardContent.children.estimate.children.cardContent.children.addPenaltyRebateButton",
          "visible",
          true
        )
      );
    }
    const printCont = downloadPrintContainer(
      action,
      state,
      dispatch,
      processInstanceAppStatus,
      applicationNumber,
      tenantId
    );
    set(
      action,
      "screenConfig.components.div.children.headerDiv.children.helpSection.children",
      printCont
    );

    let data = get(state, "screenConfiguration.preparedFinalObject");

    const obj = setStatusBasedValue(status);

    // Get approval details based on status and set it in screenconfig

    if (
      status === "APPROVED" ||
      status === "REJECTED" ||
      status === "CANCELLED"
    ) {
      set(
        action,
        "screenConfig.components.div.children.taskDetails.children.cardContent.children.approvalDetails.visible",
        true
      );

      if (get(data, "WaterConnection[0].documents")) {
        await setDocuments(
          data,
          "WaterConnection[0].documents",
          "LicensesTemp[0].verifyDocData",
          dispatch, 'NewWS1'
        );
      } else {
        dispatch(
          handleField(
            "search-preview",
            "components.div.children.taskDetails.children.cardContent.children.approvalDetails.children.cardContent.children.viewTow.children.lbl",
            "visible",
            false
          )
        );
      }
    } else {
      set(
        action,
        "screenConfig.components.div.children.taskDetails.children.cardContent.children.approvalDetails.visible",
        false
      );
    }

    if (status === "cancelled")
      set(
        action,
        "screenConfig.components.div.children.headerDiv.children.helpSection.children.cancelledLabel.visible",
        true
      );

    setActionItems(action, obj);
    if (get(state, "screenConfiguration.preparedFinalObject.WaterConnection[0].additionalDetails.locality", null) === null) {
      dispatch(prepareFinalObject("WaterConnection[0].additionalDetails.locality", get(state, "screenConfiguration.preparedFinalObject.WaterConnection[0].property.address.locality.code")));
    }
  }


};

let titleText = "";

const setStatusBasedValue = status => {
  switch (status) {
    case "approved":
      return {
        titleText: "Review the Trade License",
        titleKey: "WS_REVIEW_TRADE_LICENSE",
        titleVisibility: true,
        roleDefination: {
          rolePath: "user-info.roles",
          roles: ["WS_APPROVER"]
        }
      };
    case "pending_payment":
      return {
        titleText: "Review the Application and Proceed",
        titleKey: "WS_REVIEW_APPLICATION_AND_PROCEED",
        titleVisibility: true,
        roleDefination: {
          rolePath: "user-info.roles",
          roles: ["WS_CEMP"]
        }
      };
    case "pending_approval":
      return {
        titleText: "Review the Application and Proceed",
        titleKey: "WS_REVIEW_APPLICATION_AND_PROCEED",
        titleVisibility: true,
        roleDefination: {
          rolePath: "user-info.roles",
          roles: ["WS_APPROVER"]
        }
      };
    case "cancelled":
      return {
        titleText: "",
        titleVisibility: false,
        roleDefination: {}
      };
    case "rejected":
      return {
        titleText: "",
        titleVisibility: false,
        roleDefination: {}
      };

    default:
      return {
        titleText: "",
        titleVisibility: false,
        roleDefination: {}
      };
  }
};

const estimate = getCommonGrayCard({
  header: getCommonSubHeader({ labelKey: "WS_TASK_DETAILS_FEE_ESTIMATE" }),
  estimateSection: getFeesEstimateOverviewCard({
    sourceJsonPath: "dataCalculation",
    // isCardrequired: true
  }),
  buttonView: getDialogButton(
    "VIEW BREAKUP",
    "WS_PAYMENT_VIEW_BREAKUP",
    "search-preview"
  ),
  addPenaltyRebateButton: {
    componentPath: "Button",
    props: {
      color: "primary",
      style: {}
    },
    children: {
      previousButtonLabel: getLabel({
        labelKey: "WS_PAYMENT_ADD_REBATE_PENALTY"
      })
    },
    onClickDefination: {
      action: "condition",
      callBack: (state, dispatch) => {
        showHideAdhocPopup(state, dispatch, "search-preview");
      }
    },
    visible: false
  },
});

export const reviewConnectionDetails = getReviewConnectionDetails(false);

export const reviewOwnerDetails = getReviewOwner(false);

export const reviewModificationsDetails = reviewModificationsEffective(process.env.REACT_APP_NAME !== "Citizen");

export const reviewDocumentDetails = getReviewDocuments(false);

// let approvalDetails = getApprovalDetails(status);
let title = getCommonTitle({ labelName: titleText });

const setActionItems = (action, object) => {
  set(
    action,
    "screenConfig.components.div.children.taskDetails.children.cardContent.children.title",
    getCommonTitle({
      labelName: get(object, "titleText"),
      labelKey: get(object, "titleKey")
    })
  );
  set(
    action,
    "screenConfig.components.div.children.taskDetails.children.cardContent.children.title.visible",
    get(object, "titleVisibility")
  );
  set(
    action,
    "screenConfig.components.div.children.taskDetails.children.cardContent.children.title.roleDefination",
    get(object, "roleDefination")
  );
};

export const taskDetails = getCommonCard({
  title,
  estimate,
  reviewConnectionDetails,
  reviewDocumentDetails,
  reviewOwnerDetails,
  reviewModificationsDetails
});

export const summaryScreen = getCommonCard({
  reviewConnectionDetails,
  reviewModificationsDetails,
  reviewDocumentDetails,
  reviewOwnerDetails
})

const screenConfig = {
  uiFramework: "material-ui",
  name: "search-preview",
  beforeInitScreen: (action, state, dispatch) => {
    const status = getQueryArg(window.location.href, "status");
    const tenantId = getQueryArg(window.location.href, "tenantId");
    let applicationNumber = getQueryArg(window.location.href, "applicationNumber");
    const queryObject = [
      { key: "tenantId", value: tenantId },
    ];

    setBusinessServiceDataToLocalStorage(queryObject, dispatch);
    //To set the application no. at the  top
    set(action.screenConfig, "components.div.children.headerDiv.children.header1.children.application.children.applicationNumber.props.number", applicationNumber);
    // if (status !== "pending_payment") {
    //   set(action.screenConfig, "components.div.children.taskDetails.children.cardContent.children.viewBreakupButton.visible", false);
    // }
    if (isModifyMode()) {
      serviceModuleName = service === serviceConst.WATER ? "ModifyWSConnection" : "ModifySWConnection";
    }

    set(action, "screenConfig.components.adhocDialog.children.popup", adhocPopup);
    loadUlbLogo(tenantId);
    beforeInitFn(action, state, dispatch, applicationNumber);
    set(
      action,
      "screenConfig.components.div.children.headerDiv.children.header1.children.application.children.applicationNumber.props.number",
      applicationNumber
    );
    set(action, 'screenConfig.components.div.children.taskStatus.props.dataPath', (service === serviceConst.WATER) ? "WaterConnection" : "SewerageConnection");
    set(action, 'screenConfig.components.div.children.taskStatus.props.moduleName', serviceModuleName);
    set(action, 'screenConfig.components.div.children.taskStatus.props.updateUrl', serviceUrl);
    set(action, 'screenConfig.components.div.children.taskStatus.props.bserviceTemp', (service === serviceConst.WATER) ? "WS.ONE_TIME_FEE" : "SW.ONE_TIME_FEE");
    set(action, 'screenConfig.components.div.children.taskStatus.props.redirectQueryString', redirectQueryString);
    set(action, 'screenConfig.components.div.children.taskStatus.props.editredirect', editredirect);
    return action;
  },

  components: {
    div: {
      uiFramework: "custom-atoms",
      componentPath: "Div",
      props: {
        className: "common-div-css search-preview"
      },
      children: {
        headerDiv: {
          uiFramework: "custom-atoms",
          componentPath: "Container",
          children: {
            header1: {
              gridDefination: {
                xs: 12,
                sm: 8
              },
              ...headerrow
            },
            helpSection: {
              uiFramework: "custom-atoms",
              componentPath: "Container",
              props: {
                color: "primary",
                style: { justifyContent: "flex-end" } //, dsplay: "block"
              },
              gridDefination: {
                xs: 12,
                sm: 4,
                align: "right"
              },
            }
          }
        },
        taskStatus: {
          uiFramework: "custom-containers-local",
          componentPath: "WorkFlowContainer",
          moduleName: "egov-workflow",
          // visible: process.env.REACT_APP_NAME === "Citizen" ? false : true,
          props: {
            dataPath: (service === serviceConst.WATER) ? "WaterConnection" : "SewerageConnection",
            moduleName: serviceModuleName,
            updateUrl: serviceUrl,
            baseUrlTemp: 'wns',
            bserviceTemp: (service === serviceConst.WATER) ? "WS.ONE_TIME_FEE" : "SW.ONE_TIME_FEE",
            redirectQueryString: redirectQueryString,
            editredirect: editredirect,
            beforeSubmitHook: (data) => {
              data = data[0];
              set(data, 'propertyId', get(data, 'property.propertyId', null));
              data.assignees = [];
              if (data.assignee) {
                data.assignee.forEach(assigne => {
                  data.assignees.push({
                    uuid: assigne
                  })
                })
              }
              data.processInstance = {
                documents: data.wfDocuments,
                assignes: data.assignees,
                comment: data.comment,
                action: data.action
              }
              data.waterSource = getWaterSource(data.waterSource, data.waterSubSource);
              return data;
            }
          }
        },
        snackbarWarningMessage,
        taskDetails,
      }
    },
    breakUpDialog: {
      uiFramework: "custom-containers-local",
      moduleName: "egov-wns",
      componentPath: "ViewBreakupContainer",
      props: {
        open: false,
        maxWidth: "md",
        screenKey: "search-preview",
      }
    },
    adhocDialog: {
      uiFramework: "custom-containers-local",
      moduleName: "egov-wns",
      componentPath: "DialogContainer",
      props: {
        open: false,
        maxWidth: "sm",
        screenKey: "search-preview"
      },
      children: {
        popup: {}
      }
    },
  }
};

//----------------- search code (feb17)---------------------- //
const searchResults = async (action, state, dispatch, applicationNumber, processInstanceAppStatus) => {
  let queryObjForSearch = [{ key: "tenantId", value: tenantId }, { key: "applicationNumber", value: applicationNumber }]
  let viewBillTooltip = [], estimate, payload = [];
  if (service === serviceConst.WATER) {
    payload = [];
    payload = await getSearchResults(queryObjForSearch);
    set(payload, 'WaterConnection[0].service', service);
    const convPayload = findAndReplace(payload, "NA", null)
    let queryObjectForEst = [{
      applicationNo: applicationNumber,
      tenantId: tenantId,
      waterConnection: convPayload.WaterConnection[0]
    }]
    set(action.screenConfig, "components.div.children.taskDetails.children.cardContent.children.reviewConnectionDetails.children.cardContent.children.viewFour.props.items[0].item0.children.cardContent.children.serviceCardContainerForSW.visible", false);
    set(action.screenConfig, "components.div.children.taskDetails.children.cardContent.children.reviewConnectionDetails.children.cardContent.children.viewFour.props.items[0].item0.children.cardContent.children.serviceCardContainerForWater.visible", true);
    set(action.screenConfig, "components.div.children.taskDetails.children.cardContent.children.reviewOwnerDetails.children.cardContent.children.viewSixVS.visible", false);
    set(action.screenConfig, "components.div.children.taskDetails.children.cardContent.children.reviewOwnerDetails.children.cardContent.children.viewSixWS.visible", true);
    if (payload !== undefined && payload !== null) {
      dispatch(prepareFinalObject("WaterConnection[0]", payload.WaterConnection[0]));
      if (get(payload, "WaterConnection[0].property.status", "") !== "ACTIVE") {
        set(action.screenConfig, "components.div.children.snackbarWarningMessage.children.clickHereLink.props.propertyId", get(payload, "WaterConnection[0].property.propertyId", ""));
        set(action.screenConfig, "components.div.children.snackbarWarningMessage.children.clickHereLink.visible", true);
      }
      if (!payload.WaterConnection[0].connectionHolders || payload.WaterConnection[0].connectionHolders === 'NA') {
        set(action.screenConfig, "components.div.children.taskDetails.children.cardContent.children.reviewConnectionDetails.children.cardContent.children.viewFive.visible", false);
        set(action.screenConfig, "components.div.children.taskDetails.children.cardContent.children.reviewConnectionDetails.children.cardContent.children.viewSix.visible", true);
      } else {
        set(action.screenConfig, "components.div.children.taskDetails.children.cardContent.children.reviewConnectionDetails.children.cardContent.children.viewSix.visible", false);
        set(action.screenConfig, "components.div.children.taskDetails.children.cardContent.children.reviewConnectionDetails.children.cardContent.children.viewFive.visible", true);
      }
    }
    if (processInstanceAppStatus === "CONNECTION_ACTIVATED") {
      let connectionNumber = payload.WaterConnection[0].connectionNo;
      set(action.screenConfig, "components.div.children.headerDiv.children.header1.children.connection.children.connectionNumber.props.number", connectionNumber);
    } else {
      set(action.screenConfig, "components.div.children.headerDiv.children.header1.children.connection.children.connectionNumber.visible", false);
    }

    // to set documents 
    if (payload.WaterConnection[0].documents !== null && payload.WaterConnection[0].documents !== "NA") {
      await setDocuments(
        state.screenConfiguration.preparedFinalObject,
        "WaterConnection[0].documents",
        "DocumentsData",
        dispatch,
        "WS"
      );
    }
    estimate = await waterEstimateCalculation(queryObjectForEst, dispatch);
    if (estimate !== null && estimate !== undefined) {
      if (estimate.Calculation.length > 0) {
        await processBills(estimate, viewBillTooltip, dispatch);

        // viewBreakUp 
        estimate.Calculation[0].billSlabData = _.groupBy(estimate.Calculation[0].taxHeadEstimates, 'category')
        estimate.Calculation[0].appStatus = processInstanceAppStatus;
        dispatch(prepareFinalObject("dataCalculation", estimate.Calculation[0]));
      }
    }

    if (isModifyMode()) {
      let connectionNo = payload.WaterConnection[0].connectionNo;
      let queryObjForSearchApplications = [{ key: "tenantId", value: tenantId }, { key: "connectionNumber", value: connectionNo }, { key: "isConnectionSearch", value: true }]
      let oldApplicationPayload = await getSearchResults(queryObjForSearchApplications);
      oldApplicationPayload.WaterConnection = oldApplicationPayload.WaterConnection.sort((row1,row2)=>row2.auditDetails.createdTime - row1.auditDetails.createdTime);
      if(oldApplicationPayload.WaterConnection.length>1){
        oldApplicationPayload.WaterConnection.shift();
      }
      const waterSource=oldApplicationPayload.WaterConnection[0].waterSource||'';
      oldApplicationPayload.WaterConnection[0].waterSource=waterSource.includes("null") ? "NA" : waterSource.split(".")[0];
      oldApplicationPayload.WaterConnection[0].waterSubSource=waterSource.includes("null") ? "NA" : waterSource.split(".")[1];
      if (oldApplicationPayload.WaterConnection.length > 0) {
        dispatch(prepareFinalObject("WaterConnectionOld", oldApplicationPayload.WaterConnection))
      }
    }



  } else if (service === serviceConst.SEWERAGE) {
    payload = [];
    payload = await getSearchResultsForSewerage(queryObjForSearch, dispatch);
    payload.SewerageConnections[0].service = service;
    set(action.screenConfig, "components.div.children.taskDetails.children.cardContent.children.reviewConnectionDetails.children.cardContent.children.viewFour.props.items[0].item0.children.cardContent.children.serviceCardContainerForSW.visible", true);
    set(action.screenConfig, "components.div.children.taskDetails.children.cardContent.children.reviewConnectionDetails.children.cardContent.children.viewFour.props.items[0].item0.children.cardContent.children.serviceCardContainerForWater.visible", false);
    set(action.screenConfig, "components.div.children.taskDetails.children.cardContent.children.reviewOwnerDetails.children.cardContent.children.viewSixVS.visible", true);
    set(action.screenConfig, "components.div.children.taskDetails.children.cardContent.children.reviewOwnerDetails.children.cardContent.children.viewSixWS.visible", false); 
    if (payload !== undefined && payload !== null) {
      dispatch(prepareFinalObject("SewerageConnection[0]", payload.SewerageConnections[0]));
      dispatch(prepareFinalObject("WaterConnection[0]", payload.SewerageConnections[0]));
      if (!payload.SewerageConnections[0].connectionHolders || payload.SewerageConnections[0].connectionHolders === 'NA') {
        set(action.screenConfig, "components.div.children.taskDetails.children.cardContent.children.reviewConnectionDetails.children.cardContent.children.viewFive.visible", false);
        set(action.screenConfig, "components.div.children.taskDetails.children.cardContent.children.reviewConnectionDetails.children.cardContent.children.viewSix.visible", true);
      } else {
        set(action.screenConfig, "components.div.children.taskDetails.children.cardContent.children.reviewConnectionDetails.children.cardContent.children.viewSix.visible", false);
        set(action.screenConfig, "components.div.children.taskDetails.children.cardContent.children.reviewConnectionDetails.children.cardContent.children.viewFive.visible", true);
      }
      if (isModifyMode()) {
        let connectionNo = payload.SewerageConnections[0].connectionNo;
        let queryObjForSearchApplications = [{ key: "tenantId", value: tenantId }, { key: "connectionNumber", value: connectionNo }, { key: "isConnectionSearch", value: true }]
        let oldApplicationPayload = await getSearchResultsForSewerage(queryObjForSearchApplications,dispatch);
        oldApplicationPayload.SewerageConnections = oldApplicationPayload.SewerageConnections.filter(row => {
          return row.applicationType !== "MODIFY_SEWERAGE_CONNECTION"
        })
             if (oldApplicationPayload.SewerageConnections.length > 0) {
          dispatch(prepareFinalObject("SewerageConnectionOld[0]", oldApplicationPayload.SewerageConnections[0]))
          dispatch(prepareFinalObject("WaterConnectionOld[0]",oldApplicationPayload.SewerageConnections[0]));
        }
      }
    }
    //connection number display
    if (processInstanceAppStatus === "CONNECTION_ACTIVATED") {
      let connectionNumber = payload.SewerageConnections[0].connectionNo;
      set(action.screenConfig, "components.div.children.headerDiv.children.header1.children.connection.children.connectionNumber.props.number", connectionNumber);
    } else {
      set(action.screenConfig, "components.div.children.headerDiv.children.header1.children.connection.children.connectionNumber.visible", false);
    }

    // to set documents 
    if (payload.SewerageConnections[0].documents !== null && payload.SewerageConnections[0].documents !== "NA") {
      await setDocuments(
        state.screenConfiguration.preparedFinalObject,
        "WaterConnection[0].documents",
        "DocumentsData",
        dispatch,
        "WS"
      );
    }

    const convPayload = findAndReplace(payload, "NA", null)
    let queryObjectForEst = [{
      applicationNo: applicationNumber,
      tenantId: tenantId,
      sewerageConnection: convPayload.SewerageConnections[0]
    }]
    estimate = await swEstimateCalculation(queryObjectForEst, dispatch);
    let viewBillTooltip = []
    if (estimate !== null && estimate !== undefined) {
      if (estimate.Calculation !== undefined && estimate.Calculation.length > 0) {
        await processBills(estimate, viewBillTooltip, dispatch);
        // viewBreakUp 
        estimate.Calculation[0].billSlabData = _.groupBy(estimate.Calculation[0].taxHeadEstimates, 'category')
        estimate.Calculation[0].appStatus = processInstanceAppStatus;
        dispatch(prepareFinalObject("dataCalculation", estimate.Calculation[0]));
      }
    }
  }
  if (estimate !== null && estimate !== undefined) {
    createEstimateData(estimate.Calculation[0].taxHeadEstimates, "taxHeadEstimates", dispatch, {}, {});
  }
};

const parserFunction = (obj) => {
  let parsedObject = {
    roadCuttingArea: parseInt(obj.roadCuttingArea),
    meterInstallationDate: convertDateToEpoch(obj.meterInstallationDate),
    connectionExecutionDate: convertDateToEpoch(obj.connectionExecutionDate),
    proposedWaterClosets: parseInt(obj.proposedWaterClosets),
    proposedToilets: parseInt(obj.proposedToilets),
    roadCuttingArea: parseInt(obj.roadCuttingArea),
    additionalDetails: {
      initialMeterReading: (
        obj.additionalDetails !== undefined &&
        obj.additionalDetails.initialMeterReading !== undefined
      ) ? parseFloat(obj.additionalDetails.initialMeterReading) : null,
      detailsProvidedBy: (
        obj.additionalDetails !== undefined &&
        obj.additionalDetails.detailsProvidedBy !== undefined &&
        obj.additionalDetails.detailsProvidedBy !== null
      ) ? obj.additionalDetails.detailsProvidedBy : "",
    },
    dateEffectiveFrom: convertDateToEpoch(obj.dateEffectiveFrom),
    noOfTaps: parseInt(obj.noOfTaps),
    proposedTaps: parseInt(obj.proposedTaps),
    plumberInfo: (obj.plumberInfo === null || obj.plumberInfo === "NA") ? [] : obj.plumberInfo
  }
  obj = { ...obj, ...parsedObject }
  return obj;
}

const processBills = async (data, viewBillTooltip, dispatch) => {
  let des, obj, groupBillDetails = [];
  let appNumber = data.Calculation[0].applicationNo;
  data.Calculation[0].taxHeadEstimates.forEach(async element => {
    let cessKey = element.taxHeadCode
    let body;
    if (service === serviceConst.WATER || appNumber.includes("WS")) {
      body = { "MdmsCriteria": { "tenantId": tenantId, "moduleDetails": [{ "moduleName": "ws-services-calculation", "masterDetails": [{ "name": cessKey }] }] } }
    } else {
      body = { "MdmsCriteria": { "tenantId": tenantId, "moduleDetails": [{ "moduleName": "sw-services-calculation", "masterDetails": [{ "name": cessKey }] }] } }
    }
    let res = await getDescriptionFromMDMS(body, dispatch)
    if (res !== null && res !== undefined && res.MdmsRes !== undefined && res.MdmsRes !== null) {
      if (service === serviceConst.WATER || appNumber.includes("WS")) { des = res.MdmsRes["ws-services-calculation"]; }
      else { des = res.MdmsRes["sw-services-calculation"]; }
      if (des !== null && des !== undefined && des[cessKey] !== undefined && des[cessKey][0] !== undefined && des[cessKey][0] !== null) {
        groupBillDetails.push({ key: cessKey, value: des[cessKey][0].description, amount: element.estimateAmount, order: element.order })
      } else {
        groupBillDetails.push({ key: cessKey, value: 'Please put some description in mdms for this Key', amount: element.estimateAmount, category: element.category })
      }
    }
  })
  obj = { bill: groupBillDetails }
  viewBillTooltip.push(obj);
  const dataArray = [{ total: data.Calculation[0].totalAmount }]
  const finalArray = [{ description: viewBillTooltip, data: dataArray }]
  dispatch(prepareFinalObject("viewBillToolipData", finalArray));
}


export default screenConfig;
