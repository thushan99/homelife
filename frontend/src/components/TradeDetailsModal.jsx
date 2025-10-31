import React, { useState, useEffect, useRef } from "react";
import logo1 from "../Assets/logo.jpeg";
import TradeEditModal from "./TradeEditModal";
import { generatePDFFromElement, blobToBase64 } from "../utils/pdfGenerator";
import {
  formatCurrency,
  getEFTTypeDisplayName,
  getPaymentPlanDisplayName,
} from "../utils/eftUtils";
import axiosInstance from "../config/axios";

const TradeDetailsModal = ({ trade, onClose, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isUploadingToDropbox, setIsUploadingToDropbox] = useState(false);
  const [lastGeneratedPDF, setLastGeneratedPDF] = useState(null);
  const [dropboxAccessToken, setDropboxAccessToken] = useState(
    localStorage.getItem("dropboxAccessToken") || null
  );
  const [dropboxRefreshToken, setDropboxRefreshToken] = useState(
    localStorage.getItem("dropboxRefreshToken") || null
  );
  // Ref for the PDF content div (we'll create it in the render)
  const pdfContentRef = useRef();

  if (!trade) return null;

  // Helper: get nested safely

  const get = (obj, path, fallback = "-") =>
    path

      .split(".")

      .reduce((o, k) => (o && o[k] !== undefined ? o[k] : fallback), obj);

  // Helper to render a table from an array of objects

  const renderTable = (rows) => {
    if (!rows || !rows.length)
      return <div className="text-gray-500">No data.</div>;

    const headers = Object.keys(rows[0]);

    const capitalizedHeaders = headers.map(
      (h) => h.charAt(0).toUpperCase() + h.slice(1)
    );

    return (
      <table className="min-w-full border border-gray-300 mb-2 text-sm">
        <thead>
          <tr>
            {headers.map((h, index) => (
              <th key={h} className="px-2 py-1 text-left bg-gray-100 border">
                {capitalizedHeaders[index]}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {headers.map((h) => (
                <td key={h} className="border px-2 py-1">
                  {row[h]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  // Add a helper function inside the component, before renderFinancialSection

  const displayAmount = (val) =>
    val !== undefined && val !== null && val !== "" ? val : "0.00";

  // Shared function to generate complete trade HTML for PDF/Print
  const generateTradeHTML = async () => {
    const currentDate = new Date().toLocaleDateString();

    // Fetch EFTs
    let realEstateTrustEFTs = [];
    let commissionTrustEFTs = [];

    if (trade && trade._id) {
      try {
        const [realEstateRes, commissionRes] = await Promise.all([
          axiosInstance.get(`/real-estate-trust-eft/trade/${trade._id}`),
          axiosInstance.get(`/commission-trust-eft/trade/${trade._id}`),
        ]);
        realEstateTrustEFTs = realEstateRes.data || [];
        commissionTrustEFTs = commissionRes.data || [];
      } catch (err) {
        console.error("Error fetching EFTs:", err);
      }
    }

    // Get all transaction details (reuse existing logic from handlePrint)
    const transactionDetails = getTransactionDetails();

    // Generate the complete HTML (this will be the same HTML used in handlePrint)
    return transactionDetails; // This contains the full HTML string
  };

  // Print function

  const handlePrint = async () => {
    if (isPrinting) return; // Prevent multiple clicks

    setIsPrinting(true);

    try {
      // Try to open a new window first

      let printWindow = window.open("", "_blank");

      let useCurrentWindow = false;

      if (!printWindow) {
        // If popup is blocked, use current window

        useCurrentWindow = true;

        printWindow = window;
      }

      const currentDate = new Date().toLocaleDateString();

      // Fetch EFTs for print preview

      let realEstateTrustEFTs = [];

      let commissionTrustEFTs = [];

      if (trade && trade._id) {
        try {
          const [realEstateRes, commissionRes] = await Promise.all([
            axiosInstance.get(`/real-estate-trust-eft/trade/${trade._id}`),

            axiosInstance.get(`/commission-trust-eft/trade/${trade._id}`),
          ]);

          realEstateTrustEFTs = realEstateRes.data || [];

          commissionTrustEFTs = commissionRes.data || [];
        } catch (err) {
          // fallback to empty arrays
        }
      }

      const commissionIncome =
        trade.commission?.commissionIncomeRows?.[0] || {};

      const baseOfficeCommission = "";

      // Get the trade classification

      const tradeClassification = trade.keyInfo?.classification || "";

      const isCoOperatingSide = tradeClassification === "CO-OPERATING SIDE";

      // Calculate Sub-Total and HST for Commission row

      const listingAmount =
        commissionIncome.listingAmount && commissionIncome.listingAmount !== ""
          ? parseFloat(commissionIncome.listingAmount)
          : 0;

      const sellingAmount =
        commissionIncome.sellingAmount && commissionIncome.sellingAmount !== ""
          ? parseFloat(commissionIncome.sellingAmount)
          : 0;

      const subTotal = (listingAmount + sellingAmount).toFixed(2);

      // Calculate HST based on the amounts (13% of each amount)

      const listingTax = (listingAmount * 0.13).toFixed(2);

      const sellingTax = (sellingAmount * 0.13).toFixed(2);

      const hst = (parseFloat(listingTax) + parseFloat(sellingTax)).toFixed(2);

      const total = (parseFloat(subTotal) + parseFloat(hst)).toFixed(2);

      // Get first outside broker row (from commission or outsideBrokers)

      let outsideBrokerInfo = null;

      if (trade.commission?.outsideBrokersRows?.length > 0) {
        outsideBrokerInfo = trade.commission.outsideBrokersRows[0];
      } else if (trade.outsideBrokers?.length > 0) {
        outsideBrokerInfo = trade.outsideBrokers[0];
      }

      // Determine side and amounts

      let obListing = "0.00",
        obSelling = "0.00",
        obSubTotal = "0.00",
        obTax = "0.00",
        obTotal = "0.00",
        obName = "";

      if (outsideBrokerInfo) {
        // Get the broker name

        const brokerName = `${
          outsideBrokerInfo.agentName || outsideBrokerInfo.firstName || ""
        } ${outsideBrokerInfo.lastName || ""}`.trim();

        // Get the company name

        const companyName =
          outsideBrokerInfo.company || outsideBrokerInfo.brokerage || "";

        // Combine name and company

        obName =
          brokerName && companyName
            ? `${brokerName} - ${companyName}`
            : brokerName || companyName || "Outside Broker";

        // Get the selling amount from either source

        const brokerSellingAmount = outsideBrokerInfo.sellingAmount || "0.00";

        // First check the broker's end from outsideBrokers array

        const matchingBrokerInOB = trade.outsideBrokers?.find((ob) => {
          const outsideBrokerName = `${ob.firstName} ${ob.lastName}`.trim();

          return (
            outsideBrokerName ===
              (outsideBrokerInfo.agentName || outsideBrokerInfo.firstName) ||
            ob.company === outsideBrokerInfo.company
          );
        });

        // Determine the end type from either the matching broker or current broker info

        let endType = "";

        if (matchingBrokerInOB) {
          if (
            matchingBrokerInOB.end?.toLowerCase().includes("listing") ||
            matchingBrokerInOB.type?.toLowerCase().includes("listing")
          ) {
            endType = "listing";
          } else {
            endType = "selling";
          }
        } else {
          const end = (
            outsideBrokerInfo.end ||
            outsideBrokerInfo.type ||
            ""
          ).toLowerCase();

          endType = end.includes("listing") ? "listing" : "selling";
        }

        // Place amount in appropriate column based on end type

        if (endType === "listing") {
          obListing = brokerSellingAmount;

          obSelling = "0.00";
        } else {
          obListing = "0.00";

          obSelling = brokerSellingAmount;
        }

        obSubTotal = brokerSellingAmount;

        obTax = outsideBrokerInfo.tax || "0.00";

        obTotal = outsideBrokerInfo.total || "0.00";
      }

      // Calculate Base Office Commission

      let baseOfficeCommissionListing,
        baseOfficeCommissionSelling,
        baseOfficeCommissionSubTotal,
        baseOfficeCommissionHST,
        baseOfficeCommissionTotal;

      if (isCoOperatingSide) {
        // For Co-operating Side, base office commission should be similar to commission values

        // Base Office Commission = Commission (same values)

        baseOfficeCommissionListing = listingAmount;

        baseOfficeCommissionSelling = sellingAmount;

        baseOfficeCommissionSubTotal = subTotal;

        baseOfficeCommissionHST = hst;

        baseOfficeCommissionTotal = total;
      } else {
        // For other classifications, base office commission is the net amount after outside broker deductions

        baseOfficeCommissionListing = (
          parseFloat(listingAmount) - parseFloat(obListing)
        ).toFixed(2);

        baseOfficeCommissionSelling = (
          parseFloat(sellingAmount) - parseFloat(obSelling)
        ).toFixed(2);

        baseOfficeCommissionSubTotal = (
          parseFloat(subTotal) - parseFloat(obSubTotal)
        ).toFixed(2);

        baseOfficeCommissionHST = (parseFloat(hst) - parseFloat(obTax)).toFixed(
          2
        );

        baseOfficeCommissionTotal = (
          parseFloat(total) - parseFloat(obTotal)
        ).toFixed(2);
      }

      // Calculate Agent Commission for all agents

      const agentCalculations = (trade.agentCommissionList || []).map(
        (agent) => {
          const agentAmount =
            agent.amount && agent.amount !== "" ? parseFloat(agent.amount) : 0;

          const agentFeesDeducted =
            agent.feesDeducted && agent.feesDeducted !== ""
              ? parseFloat(agent.feesDeducted)
              : 0;

          const agentClassification = agent.classification?.toLowerCase() || "";

          // Calculate agent commission as Amount - Fees Deducted

          const agentCommission = agentAmount - agentFeesDeducted;

          // Get buyer rebate amount for this agent

          const buyerRebateAmount =
            agent.buyerRebateIncluded === "yes" && agent.buyerRebateAmount
              ? parseFloat(agent.buyerRebateAmount) || 0
              : 0;

          // Determine agent amounts based on trade classification (not agent classification)

          let agentListing = "0.00";

          let agentSelling = "0.00";

          // Use trade classification to determine which column the agent amount goes in

          if (isCoOperatingSide) {
            // For CO-OPERATING SIDE: put agent amount in selling column

            agentListing = "0.00";

            // Apply buyer rebate deduction to selling amount

            agentSelling = (agentCommission - buyerRebateAmount).toFixed(2);
          } else {
            // For LISTING SIDE: put agent amount in listing column

            agentListing = (agentCommission - buyerRebateAmount).toFixed(2);

            agentSelling = "0.00";
          }

          // Calculate agent sub-total, HST, and total

          let agentSubTotal = (
            parseFloat(agentListing) + parseFloat(agentSelling)
          ).toFixed(2);

          // HST is calculated on the original commission amount (before buyer rebate deduction)

          const agentHST = (agentCommission * 0.13).toFixed(2);

          const agentTotal = (
            parseFloat(agentSubTotal) + parseFloat(agentHST)
          ).toFixed(2);

          return {
            ...agent,

            agentListing,

            agentSelling,

            agentSubTotal,

            agentHST,

            agentTotal,
          };
        }
      );

      // Calculate total buyer rebate amounts from all agents

      const totalBuyerRebate = (trade.agentCommissionList || []).reduce(
        (total, agent) => {
          if (agent.buyerRebateIncluded === "yes" && agent.buyerRebateAmount) {
            return total + parseFloat(agent.buyerRebateAmount || 0);
          }

          return total;
        },

        0
      );

      // Determine which column to show buyer rebate based on trade classification

      let buyerRebateListing = "0.00";

      let buyerRebateSelling = "0.00";

      if (isCoOperatingSide) {
        // For CO-OPERATING SIDE: put buyer rebate in selling column

        buyerRebateSelling = (totalBuyerRebate || 0).toFixed(2);
      } else {
        // For LISTING SIDE: put buyer rebate in listing column

        buyerRebateListing = (totalBuyerRebate || 0).toFixed(2);
      }

      // Calculate Net to Office = (Expenses - Agents) - Liabilities

      let netToOfficeListing,
        netToOfficeSelling,
        netToOfficeSubTotal,
        netToOfficeHST,
        netToOfficeTotal;

      // Calculate total agent amounts across all agents

      let totalAgentListing,
        totalAgentSelling,
        totalAgentSubTotal,
        totalAgentHST,
        totalAgentTotal;

      if (!isCoOperatingSide && agentCalculations.length === 2) {
        // For LISTING SIDE with 2 agents: Net to Office = Agent 1 - Agent 2

        const agent1 = agentCalculations[0] || {};

        const agent2 = agentCalculations[1] || {};

        totalAgentListing =
          parseFloat(agent1.agentListing || 0) -
          parseFloat(agent2.agentListing || 0);

        totalAgentSelling =
          parseFloat(agent1.agentSelling || 0) -
          parseFloat(agent2.agentSelling || 0);

        totalAgentSubTotal =
          parseFloat(agent1.agentSubTotal || 0) -
          parseFloat(agent2.agentSubTotal || 0);

        totalAgentHST =
          parseFloat(agent1.agentHST || 0) - parseFloat(agent2.agentHST || 0);

        totalAgentTotal =
          parseFloat(agent1.agentTotal || 0) -
          parseFloat(agent2.agentTotal || 0);
      } else {
        // For all other cases: sum all agents

        totalAgentListing = agentCalculations.reduce(
          (sum, agent) => sum + parseFloat(agent.agentListing || 0),

          0
        );

        totalAgentSelling = agentCalculations.reduce(
          (sum, agent) => sum + parseFloat(agent.agentSelling || 0),

          0
        );

        totalAgentSubTotal = agentCalculations.reduce(
          (sum, agent) => sum + parseFloat(agent.agentSubTotal || 0),

          0
        );

        totalAgentHST = agentCalculations.reduce(
          (sum, agent) => sum + parseFloat(agent.agentHST || 0),

          0
        );

        totalAgentTotal = agentCalculations.reduce(
          (sum, agent) => sum + parseFloat(agent.agentTotal || 0),

          0
        );
      }

      // Net to Office calculation

      if (!isCoOperatingSide && agentCalculations.length === 2) {
        // For LISTING SIDE with 2 agents: Calculate Net to Office based on Plan Amount totals

        // Calculate total Plan Amount from all agents

        const totalPlanAmount = agentCalculations.reduce((total, agent) => {
          const feesDeducted = parseFloat(agent.feesDeducted || 0);

          return total + feesDeducted;
        }, 0);

        // Apply the new formulas:

        // Sub Total = Total of Plan Amount

        netToOfficeSubTotal = totalPlanAmount.toFixed(2);

        // HST = Total of Plan Amount * 13%

        netToOfficeHST = (totalPlanAmount * 0.13).toFixed(2);

        // Total = Sub Total + HST

        netToOfficeTotal = (totalPlanAmount + totalPlanAmount * 0.13).toFixed(
          2
        );

        // For listing side with 2 agents, distribute the amounts appropriately

        // Since this is listing side, put the amounts in listing column

        netToOfficeListing = netToOfficeSubTotal;

        netToOfficeSelling = "0.00";
      } else {
        // For all other cases: Net to Office = (Expenses - Agents) - Liabilities

        // Expenses = Base Office Commission

        // Agents = Total Agent Commission (sum of all agents, or Agent 1 - Agent 2 for LISTING SIDE with 2 agents)

        // Liabilities = Buyer Rebate

        netToOfficeListing = (
          parseFloat(baseOfficeCommissionListing) -
          totalAgentListing -
          parseFloat(buyerRebateListing)
        ).toFixed(2);

        netToOfficeSelling = (
          parseFloat(baseOfficeCommissionSelling) -
          totalAgentSelling -
          parseFloat(buyerRebateSelling)
        ).toFixed(2);

        netToOfficeSubTotal = (
          parseFloat(baseOfficeCommissionSubTotal) -
          totalAgentSubTotal -
          (parseFloat(buyerRebateListing) + parseFloat(buyerRebateSelling))
        ).toFixed(2);

        netToOfficeHST = (
          parseFloat(baseOfficeCommissionHST) - totalAgentHST
        ).toFixed(2);

        netToOfficeTotal = (
          parseFloat(baseOfficeCommissionTotal) -
          totalAgentTotal -
          (parseFloat(buyerRebateListing) + parseFloat(buyerRebateSelling))
        ).toFixed(2);
      }

      // Format the outside brokers data

      const formattedOutsideBrokers =
        trade.commission?.outsideBrokersRows?.map((broker) => {
          const getEndValueForPrint = (b) => {
            // First check the broker's end from outsideBrokers array

            const matchingBroker1 = trade.outsideBrokers?.find((ob) => {
              const outsideBrokerName = `${ob.firstName} ${ob.lastName}`.trim();

              return (
                outsideBrokerName === b.agentName || ob.company === b.brokerage
              );
            });

            // If we found a matching broker in outsideBrokers array, use their end type

            if (matchingBroker1) {
              if (
                matchingBroker1.end?.toLowerCase().includes("listing") ||
                matchingBroker1.type?.toLowerCase().includes("listing")
              ) {
                return "Listing";
              }
            }

            // If no match found or not listing, check the commission broker's end/type

            if (
              b.end?.toLowerCase().includes("listing") ||
              b.type?.toLowerCase().includes("listing")
            ) {
              return "Listing";
            }

            return "Selling";
          };

          return {
            agentName: broker.agentName || "-",

            brokerage: broker.brokerage || "-",

            end: getEndValueForPrint(broker),

            sellingAmount: broker.sellingAmount || "0.00",

            tax: broker.tax || "0.00",

            total: broker.total || "0.00",
          };
        }) || [];

      // Get address information from keyInfo

      const streetNumber = get(trade, "keyInfo.streetNumber") || "";

      const streetName = get(trade, "keyInfo.streetName") || "";

      const unit = get(trade, "keyInfo.unit") || "";

      const city = get(trade, "keyInfo.city") || "";

      const province = get(trade, "keyInfo.province") || "";

      const postalCode = get(trade, "keyInfo.postalCode") || "";

      // Format address for display

      const addressLine1 =
        streetNumber && streetName ? `${streetNumber} ${streetName}` : "";

      const addressLine2 = unit || "";

      const addressLine3 = city && province ? `${city}, ${province}` : "";

      const addressLine4 = postalCode || "";

      const printContent = `

      <!DOCTYPE html>

      <html>

      <head>

        <title>Trade Record Sheet - ${trade.tradeNumber}</title>

        <style>
          /* A4 Optimized Styling - 210mm x 297mm */
          * { box-sizing: border-box; margin: 0; padding: 0; }
          
          body { 
            font-family: Arial, sans-serif; 
            margin: 0;
            padding: 15mm 12mm; /* A4 margins: top/bottom 15mm, left/right 12mm */
            font-size: 10px;
            line-height: 1.4;
            width: 210mm; /* A4 width */
            background: white;
          }

          .header { 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-start; 
            margin-bottom: 15px;
            width: 100%;
          }

          .logo { width: 70px; height: auto; }

          .title { 
            font-size: 16px; 
            font-weight: bold; 
            text-align: center; 
            flex-grow: 1;
            padding: 0 10px;
          }

          .date-address { 
            text-align: right; 
            font-size: 9px;
            line-height: 1.3;
          }

          .date { font-weight: bold; margin-bottom: 4px; }

          .address { line-height: 1.3; }

          .section { 
            margin-bottom: 12px;
            page-break-inside: avoid; /* Prevent sections from breaking across pages */
          }

          .section-title { 
            font-size: 12px; 
            font-weight: bold; 
            margin-bottom: 6px; 
            border-bottom: 1px solid #333; 
            padding-bottom: 2px;
          }

          .property-grid { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 6px; 
            margin-bottom: 8px;
          }

          .property-item { 
            display: flex; 
            justify-content: space-between; 
            font-size: 9px;
            line-height: 1.3;
          }

          .property-label { font-weight: bold; margin-right: 5px; }

          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-bottom: 8px; 
            font-size: 8px;
            page-break-inside: auto;
          }

          tr { page-break-inside: avoid; page-break-after: auto; }

          th, td { 
            border: 1px solid #ccc; 
            padding: 3px 4px; 
            text-align: left;
            line-height: 1.2;
          }

          th { 
            background-color: #f5f5f5; 
            font-weight: bold;
            font-size: 8px;
          }

          .financial-grid { 
            display: grid; 
            grid-template-columns: 1fr 1fr 1fr; 
            gap: 8px;
            margin-bottom: 10px;
          }

          .financial-item { text-align: center; }

          .financial-label { 
            font-weight: bold; 
            margin-bottom: 3px; 
            font-size: 9px;
          }

          .financial-value { font-size: 12px; font-weight: bold; }

          /* Page break helpers */
          .page-break { page-break-after: always; }
          .no-break { page-break-inside: avoid; }

          @media print {
            body { 
              margin: 0;
              padding: 15mm 12mm;
            }
            .no-print { display: none !important; }
            button { display: none !important; }
          }

        </style>

      </head>

      <body>

        <div class="header">

          <div style="display: flex; flex-direction: column; align-items: flex-start;">

            <img src="/logo.jpeg" alt="Logo" class="logo">

            <div style="font-size: 9px; line-height: 1.2; margin-top: 5px;">

                      Homelife Top Star Realty Inc., Brokerage<br>

      9889 Markham Road, Suite 201 <br>

      Markham, Ontario L6E OB7<br>

        Phone: 905-209-1400

            </div>

          </div>

          <div class="title">Trade Record Sheet</div>

          <div class="date-address">

            <div class="date">${currentDate}</div>

            <div class="address">

              ${addressLine1}<br>

              ${addressLine2}<br>

              ${addressLine3}<br>

              ${addressLine4}

            </div>

            <div style="font-size: 10px; font-weight: bold; margin-top: 5px;">

              Trade Number - ${
                get(trade, "keyInfo.tradeNumber") || trade.tradeNumber || "-"
              }

            </div>

          </div>

        </div>



        <div class="section">

          <div class="section-title">Property</div>

          <div class="property-grid">

            <div class="property-item">

              <span class="property-label">Type:</span>

              <span>${get(trade, "keyInfo.propertyType")}</span>

            </div>

            <div class="property-item">

              <span class="property-label">Classification:</span>

              <span>${get(trade, "keyInfo.classification")}</span>

            </div>

            <div class="property-item">

              <span class="property-label">Status:</span>

              <span>${get(trade, "keyInfo.status")}</span>

            </div>

            <div class="property-item">

              <span class="property-label">MLS Number:</span>

              <span>${get(trade, "keyInfo.mlsNumber")}</span>

            </div>

            <div class="property-item">

              <span class="property-label">Offer Date:</span>

              <span>${get(trade, "keyInfo.offerDate")}</span>

            </div>

            <div class="property-item">

              <span class="property-label">Entry Date:</span>

              <span>${get(trade, "keyInfo.entryDate")}</span>

            </div>

            <div class="property-item">

              <span class="property-label">Firm Date:</span>

              <span>${get(trade, "keyInfo.firmDate")}</span>

            </div>

            <div class="property-item">

              <span class="property-label">Close Date:</span>

              <span>${get(trade, "keyInfo.closeDate")}</span>

            </div>

          </div>

        </div>



        <div class="section">

          <div class="section-title">Conditions</div>

          ${
            trade.conditions && trade.conditions.length > 0
              ? `

          <table>

            <thead>

              <tr>

                <th>Condition</th>

                <th>Due Date</th>

                <th>Condition Met Date</th>

              </tr>

            </thead>

            <tbody>

              ${trade.conditions

                .map(
                  (condition) => `

                <tr>

                  <td>${condition.conditionText || "-"}</td>

                  <td>${condition.dueDate || "-"}</td>

                  <td>${condition.conditionMetDate || "Not met"}</td>

                </tr>

              `
                )

                .join("")}

            </tbody>

          </table>

          `
              : "<p>No conditions available.</p>"
          }

        </div>



        <div class="section">

          <div class="section-title">Contacts</div>

          ${
            trade.people && trade.people.length > 0
              ? `

          <table>

            <thead>

              <tr>

                <th>Type</th>

                <th>First Name</th>

                <th>Last Name</th>

                <th>Primary Phone</th>

                <th>Secondary Phone</th>

                <th>Email</th>

                <th>Company Name</th>

              </tr>

            </thead>

            <tbody>

              ${trade.people

                .map(
                  (person) => `

                <tr>

                  <td>${person.type || "-"}</td>

                  <td>${person.firstName || "-"}</td>

                  <td>${person.lastName || "-"}</td>

                  <td>${person.primaryPhone || "-"}</td>

                  <td>${person.secondaryPhone || "-"}</td>

                  <td>${person.email || "-"}</td>

                  <td>${person.companyName || "-"}</td>

                </tr>

              `
                )

                .join("")}

            </tbody>

          </table>

          `
              : "<p>No contacts available.</p>"
          }

        </div>



        <div class="section">

          <div class="section-title">Outside Brokers</div>

          ${
            trade.outsideBrokers && trade.outsideBrokers.length > 0
              ? `

          <table>

            <thead>

              <tr>

                <th>Type</th>

                <th>End</th>

                <th>First Name</th>

                <th>Last Name</th>

                <th>Company</th>

                <th>Phone Number</th>

              </tr>

            </thead>

            <tbody>

              ${trade.outsideBrokers

                .map(
                  (broker) => `

                <tr>

                  <td>${broker.type || "-"}</td>

                  <td>${broker.end || "-"}</td>

                  <td>${broker.firstName || "-"}</td>

                  <td>${broker.lastName || "-"}</td>

                  <td>${broker.company || "-"}</td>

                  <td>${broker.primaryPhone || "-"}</td>

                </tr>

              `
                )

                .join("")}

            </tbody>

          </table>

          `
              : "<p>No outside brokers available.</p>"
          }

        </div>



        <div class="section">

          <div class="section-title">Outside Brokers Commission Details</div>

          ${
            formattedOutsideBrokers.length > 0
              ? `

          <table>

            <thead>

              <tr>

                <th>Agent Name</th>

                <th>Brokerage</th>

                <th>End</th>

                <th>Selling Amount</th>

                <th>Tax</th>

                <th>Total</th>

              </tr>

            </thead>

            <tbody>

              ${formattedOutsideBrokers

                .map(
                  (broker) => `

                <tr>

                  <td>${broker.agentName}</td>

                  <td>${broker.brokerage}</td>

                  <td>${broker.end}</td>

                  <td>${formatCurrency(broker.sellingAmount)}</td>

                  <td>${formatCurrency(broker.tax)}</td>

                  <td>${formatCurrency(broker.total)}</td>

                </tr>

              `
                )

                .join("")}

            </tbody>

          </table>

          `
              : "<p>No outside brokers commission details available.</p>"
          }

        </div>



        <div class="section">

          <div class="section-title">Deposit</div>

          ${
            trade.trustRecords && trade.trustRecords.length > 0
              ? `

          <table>

            <thead>

              <tr>

                <th>We Hold</th>

                <th>Received</th>

                <th>Received From</th>

                <th>Held By</th>

                <th>Deposit Date</th>

                <th>Reference</th>

                <th>Amount</th>

                <th>Payment Type</th>

              </tr>

            </thead>

            <tbody>

              ${trade.trustRecords

                .map(
                  (record) => `

                <tr>

                  <td>${record.weHold || "-"}</td>

                  <td>${record.received || "-"}</td>

                  <td>${record.receivedFrom || "-"}</td>

                  <td>${record.heldBy || "-"}</td>

                  <td>${record.depositDate || record.date || "-"}</td>

                  <td>${record.reference || "-"}</td>

                  <td>${formatCurrency(record.amount || 0)}</td>

                  <td>${record.paymentType || "-"}</td>

                </tr>

              `
                )

                .join("")}

            </tbody>

          </table>

          `
              : "<p>No deposit records available.</p>"
          }

        </div>



        <div class="section">

          <div class="section-title">Financial</div>

          <div style="font-weight:bold; font-size:12px; margin-bottom:4px;">Financial:</div>

          <div style="margin-bottom:4px; font-size:10px;">

            <div>Selling Price: <span style="font-weight:bold;">${formatCurrency(
              commissionIncome.sellPrice || trade.keyInfo?.sellPrice || 0
            )}</span></div>

          </div>

          <div style="margin-bottom:4px; font-size:10px;">

            <div>Listing Commission: <span style="font-weight:bold;">${parseFloat(
              trade.keyInfo?.listCommission || 0
            )}%</span></div>

          </div>

          <div style="margin-bottom:4px; font-size:10px;">

            <div>Selling Commission: <span style="font-weight:bold;">${parseFloat(
              trade.keyInfo?.sellCommission || 0
            )}%</span></div>

          </div>

          <div style="display:flex; font-weight:bold; border-bottom:1px solid #ccc; padding:3px 0; border-top:1px solid #ccc; font-size:9px;">

            <div style="width:25%"></div>

            <div style="width:12%; text-align:center;">Listing</div>

            <div style="width:12%; text-align:center;">Selling</div>

            <div style="width:12%; text-align:center;">Sub-Total</div>

            <div style="width:12%; text-align:center;">HST</div>

            <div style="width:12%; text-align:center;">Total</div>

          </div>

          <div style="font-weight:bold; margin-top:6px; margin-bottom:0; font-size:10px;">Income</div>

          <div style="display:flex; border-bottom:1px solid #ccc; padding:3px 0; font-size:9px;">

            <div style="width:25%">Commission</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              listingAmount
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              sellingAmount
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              subTotal
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              hst
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              total
            )}</div>

          </div>

          ${
            isCoOperatingSide
              ? `

          <div style="display:flex; padding:3px 0; font-size:9px;">

            <div style="width:25%">Base Office Commission</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              baseOfficeCommissionListing
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              baseOfficeCommissionSelling
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              baseOfficeCommissionSubTotal
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              baseOfficeCommissionHST
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              baseOfficeCommissionTotal
            )}</div>

          </div>

          `
              : `

          <div style="font-weight:bold; margin-top:6px; font-size:10px;">Expenses</div>

          <div style="display:flex; border-bottom:1px solid #ccc; padding:3px 0; font-size:9px;">

            <div style="width:25%">${obName}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              obListing
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              obSelling
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              obSubTotal
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              obTax
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              obTotal
            )}</div>

          </div>

          <div style="display:flex; border-bottom:1px solid #ccc; padding:3px 0; font-size:9px;">

            <div style="width:25%">Base Office Commission</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              baseOfficeCommissionListing
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              baseOfficeCommissionSelling
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              baseOfficeCommissionSubTotal
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              baseOfficeCommissionHST
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              baseOfficeCommissionTotal
            )}</div>

          </div>

          `
          }

          <div style="font-weight:bold; margin-top:6px; font-size:10px;">Agents</div>

          ${agentCalculations

            .map(
              (agent) => `

          <div style="display:flex; border-bottom:1px solid #ccc; padding:3px 0; font-size:9px;">

            <div style="width:25%">(${agent.agentId || ""}) ${
                agent.agentName || ""
              }</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              agent.agentListing || "0.00"
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              agent.agentSelling || "0.00"
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              agent.agentSubTotal || "0.00"
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              agent.agentHST || "0.00"
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              agent.agentTotal || "0.00"
            )}</div>

          </div>

          `
            )

            .join("")}

          

          <!-- Liabilities Section -->

          ${
            totalBuyerRebate > 0
              ? `

          <div style="font-weight:bold; margin-top:6px; font-size:10px;">Liabilities</div>

          <div style="display:flex; border-bottom:1px solid #ccc; padding:3px 0; font-size:9px;">

            <div style="width:25%">Buyer Rebate</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              buyerRebateListing
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              buyerRebateSelling
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              (
                parseFloat(buyerRebateListing) + parseFloat(buyerRebateSelling)
              ).toFixed(2)
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              "0.00"
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              (
                parseFloat(buyerRebateListing) + parseFloat(buyerRebateSelling)
              ).toFixed(2)
            )}</div>

          </div>

          `
              : ""
          }

          <div style="font-weight:bold; margin-top:6px; font-size:10px;">Net to Office</div>

          <div style="display:flex; border-bottom:3px double #000; padding:3px 0; font-size:9px;">

            <div style="width:25%"></div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              netToOfficeListing
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              netToOfficeSelling
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              netToOfficeSubTotal
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              netToOfficeHST
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              netToOfficeTotal
            )}</div>

          </div>

        </div>



        <div class="section">

          <div class="section-title">Agent Details</div>

          ${
            trade.agentCommissionList && trade.agentCommissionList.length > 0
              ? `

          <table style="width:100%; border-collapse:collapse; margin-bottom:10px;">

            <thead>

              <tr style="background-color:#f2f2f2;">

                <th style="border:1px solid #ddd; padding:4px; text-align:left;">Agent Name</th>

                <th style="border:1px solid #ddd; padding:4px; text-align:left;">Agent Number</th>

                <th style="border:1px solid #ddd; padding:4px; text-align:left;">Payment Plan</th>

                <th style="border:1px solid #ddd; padding:4px; text-align:left;">Agent Base</th>

                <th style="border:1px solid #ddd; padding:4px; text-align:left;">Plan Amount</th>

                <th style="border:1px solid #ddd; padding:4px; text-align:left;">Buyer Rebate</th>

                <th style="border:1px solid #ddd; padding:4px; text-align:left;">Total</th>

              </tr>

            </thead>

            <tbody>

              ${trade.agentCommissionList

                .map(
                  (agent) => `

                <tr>

                  <td style="border:1px solid #ddd; padding:4px;">${
                    agent.agentName || "-"
                  }</td>

                  <td style="border:1px solid #ddd; padding:4px;">${
                    agent.agentId || "-"
                  }</td>

                  <td style="border:1px solid #ddd; padding:4px;">${
                    getPaymentPlanDisplayName(agent.feeInfo) || "-"
                  }</td>

                  <td style="border:1px solid #ddd; padding:4px;">${formatCurrency(
                    agent.amount || 0
                  )}</td>

                  <td style="border:1px solid #ddd; padding:4px;">${formatCurrency(
                    agent.feesDeducted || 0
                  )}</td>

                  <td style="border:1px solid #ddd; padding:4px;">${
                    agent.buyerRebateIncluded === "yes" &&
                    agent.buyerRebateAmount
                      ? formatCurrency(agent.buyerRebateAmount)
                      : "-"
                  }</td>

                  <td style="border:1px solid #ddd; padding:4px;">${formatCurrency(
                    parseFloat(agent.amount || 0) -
                      parseFloat(agent.feesDeducted || 0) -
                      (agent.buyerRebateIncluded === "yes" &&
                      agent.buyerRebateAmount
                        ? parseFloat(agent.buyerRebateAmount || 0)
                        : 0)
                  )}</td>

                </tr>

              `
                )

                .join("")}

            </tbody>

          </table>

          `
              : "<p>No agent payment details available.</p>"
          }

        </div>



        <div class="section">

          <div class="section-title">Trust Activity</div>

          ${
            trade.trustRecords && trade.trustRecords.length > 0
              ? `<table><thead><tr>

                  <th>Received From</th><th>Deposit Date</th><th>Reference</th><th>Amount</th>

                </tr></thead><tbody>

                ${trade.trustRecords

                  .map(
                    (record) => `<tr>

                      <td>${record.receivedFrom || "-"}</td>

                      <td>${record.depositDate || record.date || "-"}</td>

                      <td>${record.reference || "-"}</td>

                      <td>${formatCurrency(record.amount || 0)}</td>

                    </tr>`
                  )

                  .join("")}

                </tbody></table>`
              : `<div class="text-gray-500">No trust records available.</div>`
          }

        </div>



        <div class="section">

          <div class="section-title">Real Estate Trust Payments</div>

          ${
            realEstateTrustEFTs.length > 0
              ? `<table><thead><tr>

                  <th>EFT #</th><th>Date</th><th>Amount</th><th>Recipient</th><th>Type</th><th>Description</th>

                </tr></thead><tbody>

                ${realEstateTrustEFTs

                  .map(
                    (eft) => `<tr>

                      <td>${eft.eftNumber || ""}</td>

                      <td>${
                        eft.chequeDate || eft.date
                          ? new Date(
                              eft.chequeDate || eft.date
                            ).toLocaleDateString()
                          : "-"
                      }</td>

                      <td>${formatCurrency(eft.amount || "")}</td>

                      <td>${eft.recipient || ""}</td>

                      <td>${getEFTTypeDisplayName(eft.type) || ""}</td>

                      <td>${eft.description || ""}</td>

                    </tr>`
                  )

                  .join("")}

                </tbody></table>`
              : `<div class="text-gray-500">No Real Estate Trust Payments found for this trade.</div>`
          }

        </div>



        <div class="section">

          <div class="section-title">Commission Trust Payments</div>

          ${
            commissionTrustEFTs.length > 0
              ? `<table><thead><tr>

                  <th>EFT #</th><th>Date</th><th>Amount</th><th>Recipient</th><th>Type</th><th>Description</th>

                </tr></thead><tbody>

                ${commissionTrustEFTs

                  .map(
                    (eft) => `<tr>

                      <td>${eft.eftNumber || ""}</td>

                      <td>${
                        eft.chequeDate || eft.date
                          ? new Date(
                              eft.chequeDate || eft.date
                            ).toLocaleDateString()
                          : "-"
                      }</td>

                      <td>${formatCurrency(eft.amount || "")}</td>

                      <td>${eft.recipient || ""}</td>

                      <td>${getEFTTypeDisplayName(eft.type) || ""}</td>

                      <td>${eft.description || ""}</td>

                    </tr>`
                  )

                  .join("")}

                </tbody></table>`
              : `<div class="text-gray-500">No Commission Trust Payments found for this trade.</div>`
          }

        </div>



        <div class="section">

          <div class="section-title">Commission Trust Agreement</div>

          <div style="margin-bottom: 15px; font-size: 10px; line-height: 1.4;">

            It is understood between all parties that this agreement shall constitute a Commission Trust Agreement as set out in the contract.

          </div>

          <div style="margin-bottom: 15px; font-size: 10px; line-height: 1.4;">

            To the best of my knowledge the above information is correct. Dated at Moncton on ${currentDate}

          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">

            <div style="font-size: 10px;">

              ${
                agentCalculations.length > 0
                  ? `${agentCalculations[0].agentName || "Agent Name"}, ${
                      agentCalculations[0].agentId || "Agent Number"
                    }`
                  : "Agent Name, Agent Number"
              }

            </div>

            <div style="border-bottom: 1px solid #000; width: 200px; height: 20px;"></div>

          </div>

          <div style="display: flex; justify-content: space-between; align-items: center;">

            <div style="font-size: 10px;">

              Broker of Record: Homelife Top Star Realty Inc., Brokerage

            </div>

            <div style="border-bottom: 1px solid #000; width: 200px; height: 20px;"></div>

          </div>

        </div>
      </body>

      </html>

    `;

      printWindow.document.write(printContent);

      printWindow.document.close();

      // ALSO generate PDF blob for Dropbox upload (done in background)
      try {
        const pdfIframe = document.createElement("iframe");
        pdfIframe.style.position = "absolute";
        pdfIframe.style.width = "0";
        pdfIframe.style.height = "0";
        pdfIframe.style.border = "none";
        document.body.appendChild(pdfIframe);

        const pdfDoc = pdfIframe.contentWindow.document;
        pdfDoc.open();
        pdfDoc.write(printContent);
        pdfDoc.close();

        // Wait a bit for content to load
        setTimeout(async () => {
          try {
            // Generate PDF using our utility
            const pdfBlob = await generatePDFFromElement(
              pdfDoc.body,
              `Trade_${trade.tradeNumber}.pdf`
            );

            // Convert to base64 and store
            const base64 = await blobToBase64(pdfBlob);

            setLastGeneratedPDF({
              base64: `data:application/pdf;base64,${base64}`,
              fileName: `Trade_${trade.tradeNumber}_${Date.now()}.pdf`,
              size: pdfBlob.size,
              timestamp: Date.now(),
            });
            console.log("✅ PDF generated and cached for Dropbox upload");

            // Clean up iframe
            if (pdfIframe.parentNode) {
              document.body.removeChild(pdfIframe);
            }
          } catch (pdfError) {
            console.error("PDF generation for cache failed:", pdfError);
            // Don't show error to user, just log it
          }
        }, 1000);
      } catch (cacheError) {
        console.error("Failed to cache PDF:", cacheError);
        // Silent fail - doesn't affect printing
      }

      // Wait for content to load then automatically print

      setTimeout(() => {
        try {
          printWindow.print();

          // Close the window after a delay to allow printing to complete

          if (!useCurrentWindow) {
            setTimeout(() => {
              printWindow.close();
            }, 1000);
          }

          // Show success message

          if (!useCurrentWindow) {
            setTimeout(() => {
              alert("Print dialog opened successfully!");
            }, 100);
          }
        } catch (printError) {
          console.error("Print error:", printError);

          // If automatic print fails, keep the window open for manual printing

          if (!useCurrentWindow) {
            printWindow.focus();
          }

          alert(
            "Print dialog failed to open. The report is ready for manual printing."
          );
        }
      }, 500);
    } catch (error) {
      console.error("Error generating print report:", error);

      alert("Error generating print report. Please try again.");
    } finally {
      setIsPrinting(false);
    }
  };

  // Dropbox authentication handler
  const handleDropboxAuth = async () => {
    try {
      const redirectUri = `${window.location.origin}/dropbox-callback`;
      console.log("🔍 Dropbox Auth Debug:");
      console.log("  - Current origin:", window.location.origin);
      console.log("  - Redirect URI:", redirectUri);

      const response = await axiosInstance.get("/dropbox/auth-url", {
        params: { redirectUri },
      });

      console.log("  - Auth URL received:", response.data.authUrl);
      console.log("  - Server using redirect URI:", response.data.redirectUri);
      console.log(
        "\n⚠️ If you see an error, make sure this redirect URI is added to Dropbox:"
      );
      console.log("  ", response.data.redirectUri || redirectUri);

      if (response.data.success) {
        // Store current trade ID and page URL for callback
        localStorage.setItem("pendingDropboxUploadTradeId", trade._id);
        localStorage.setItem("dropboxRedirectUrl", window.location.pathname);

        // Show alert with instructions before redirecting
        alert(
          `You will be redirected to Dropbox for authentication.\n\nIf you see "Invalid redirect_uri" error, you need to add this URL to your Dropbox App Console:\n\n${
            response.data.redirectUri || redirectUri
          }\n\nGo to: https://www.dropbox.com/developers/apps\nAdd the URL above to "Redirect URIs" section\nClick "Submit" to save`
        );

        // Redirect to Dropbox auth
        window.location.href = response.data.authUrl;
      }
    } catch (error) {
      console.error("Error getting Dropbox auth URL:", error);
      alert("Failed to initiate Dropbox authentication");
    }
  };

  // Dropbox upload - automatically generates PDF and uploads to Dropbox
  const handleDropboxUpload = async () => {
    if (isUploadingToDropbox) return;

    // Check if user is authenticated
    if (!dropboxAccessToken) {
      const shouldAuth = window.confirm(
        "You need to authenticate with Dropbox first. Would you like to do that now?"
      );
      if (shouldAuth) {
        handleDropboxAuth();
      }
      return;
    }

    setIsUploadingToDropbox(true);

    try {
      console.log("📄 Generating PDF for Dropbox upload...");

      // Create invisible iframe for PDF generation
      const iframe = document.createElement("iframe");
      iframe.style.position = "absolute";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "none";
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow.document;
      const currentDate = new Date().toLocaleDateString();

      // For iframe-based PDF generation, we don't need popup windows
      const useCurrentWindow = false;

      // Fetch EFTs
      let realEstateTrustEFTs = [];
      let commissionTrustEFTs = [];
      if (trade && trade._id) {
        try {
          const [retResponse, ctResponse] = await Promise.all([
            axiosInstance.get(`/real-estate-trust-eft/trade/${trade._id}`),
            axiosInstance.get(`/commission-trust-eft/trade/${trade._id}`),
          ]);
          realEstateTrustEFTs = retResponse.data || [];
          commissionTrustEFTs = ctResponse.data || [];
        } catch (err) {
          console.error("Error fetching EFTs:", err);
        }
      }

      const commissionIncome =
        trade.commission?.commissionIncomeRows?.[0] || {};

      const baseOfficeCommission = "";

      // Get the trade classification

      const tradeClassification = trade.keyInfo?.classification || "";

      const isCoOperatingSide = tradeClassification === "CO-OPERATING SIDE";

      // Calculate Sub-Total and HST for Commission row

      const listingAmount =
        commissionIncome.listingAmount && commissionIncome.listingAmount !== ""
          ? parseFloat(commissionIncome.listingAmount)
          : 0;

      const sellingAmount =
        commissionIncome.sellingAmount && commissionIncome.sellingAmount !== ""
          ? parseFloat(commissionIncome.sellingAmount)
          : 0;

      const subTotal = (listingAmount + sellingAmount).toFixed(2);

      // Calculate HST based on the amounts (13% of each amount)

      const listingTax = (listingAmount * 0.13).toFixed(2);

      const sellingTax = (sellingAmount * 0.13).toFixed(2);

      const hst = (parseFloat(listingTax) + parseFloat(sellingTax)).toFixed(2);

      const total = (parseFloat(subTotal) + parseFloat(hst)).toFixed(2);

      // Get first outside broker row (from commission or outsideBrokers)

      let outsideBrokerInfo = null;

      if (trade.commission?.outsideBrokersRows?.length > 0) {
        outsideBrokerInfo = trade.commission.outsideBrokersRows[0];
      } else if (trade.outsideBrokers?.length > 0) {
        outsideBrokerInfo = trade.outsideBrokers[0];
      }

      // Determine side and amounts

      let obListing = "0.00",
        obSelling = "0.00",
        obSubTotal = "0.00",
        obTax = "0.00",
        obTotal = "0.00",
        obName = "";

      if (outsideBrokerInfo) {
        // Get the broker name

        const brokerName = `${
          outsideBrokerInfo.agentName || outsideBrokerInfo.firstName || ""
        } ${outsideBrokerInfo.lastName || ""}`.trim();

        // Get the company name

        const companyName =
          outsideBrokerInfo.company || outsideBrokerInfo.brokerage || "";

        // Combine name and company

        obName =
          brokerName && companyName
            ? `${brokerName} - ${companyName}`
            : brokerName || companyName || "Outside Broker";

        // Get the selling amount from either source

        const brokerSellingAmount = outsideBrokerInfo.sellingAmount || "0.00";

        // First check the broker's end from outsideBrokers array

        const matchingBrokerInOB = trade.outsideBrokers?.find((ob) => {
          const outsideBrokerName = `${ob.firstName} ${ob.lastName}`.trim();

          return (
            outsideBrokerName ===
              (outsideBrokerInfo.agentName || outsideBrokerInfo.firstName) ||
            ob.company === outsideBrokerInfo.company
          );
        });

        // Determine the end type from either the matching broker or current broker info

        let endType = "";

        if (matchingBrokerInOB) {
          if (
            matchingBrokerInOB.end?.toLowerCase().includes("listing") ||
            matchingBrokerInOB.type?.toLowerCase().includes("listing")
          ) {
            endType = "listing";
          } else {
            endType = "selling";
          }
        } else {
          const end = (
            outsideBrokerInfo.end ||
            outsideBrokerInfo.type ||
            ""
          ).toLowerCase();

          endType = end.includes("listing") ? "listing" : "selling";
        }

        // Place amount in appropriate column based on end type

        if (endType === "listing") {
          obListing = brokerSellingAmount;

          obSelling = "0.00";
        } else {
          obListing = "0.00";

          obSelling = brokerSellingAmount;
        }

        obSubTotal = brokerSellingAmount;

        obTax = outsideBrokerInfo.tax || "0.00";

        obTotal = outsideBrokerInfo.total || "0.00";
      }

      // Calculate Base Office Commission

      let baseOfficeCommissionListing,
        baseOfficeCommissionSelling,
        baseOfficeCommissionSubTotal,
        baseOfficeCommissionHST,
        baseOfficeCommissionTotal;

      if (isCoOperatingSide) {
        // For Co-operating Side, base office commission should be similar to commission values

        // Base Office Commission = Commission (same values)

        baseOfficeCommissionListing = listingAmount;

        baseOfficeCommissionSelling = sellingAmount;

        baseOfficeCommissionSubTotal = subTotal;

        baseOfficeCommissionHST = hst;

        baseOfficeCommissionTotal = total;
      } else {
        // For other classifications, base office commission is the net amount after outside broker deductions

        baseOfficeCommissionListing = (
          parseFloat(listingAmount) - parseFloat(obListing)
        ).toFixed(2);

        baseOfficeCommissionSelling = (
          parseFloat(sellingAmount) - parseFloat(obSelling)
        ).toFixed(2);

        baseOfficeCommissionSubTotal = (
          parseFloat(subTotal) - parseFloat(obSubTotal)
        ).toFixed(2);

        baseOfficeCommissionHST = (parseFloat(hst) - parseFloat(obTax)).toFixed(
          2
        );

        baseOfficeCommissionTotal = (
          parseFloat(total) - parseFloat(obTotal)
        ).toFixed(2);
      }

      // Calculate Agent Commission for all agents
      const agentCalculations = (trade.agentCommissionList || []).map(
        (agent) => {
          const agentAmount =
            agent.amount && agent.amount !== "" ? parseFloat(agent.amount) : 0;

          const agentFeesDeducted =
            agent.feesDeducted && agent.feesDeducted !== ""
              ? parseFloat(agent.feesDeducted)
              : 0;

          const agentClassification = agent.classification?.toLowerCase() || "";

          // Calculate agent commission as Amount - Fees Deducted

          const agentCommission = agentAmount - agentFeesDeducted;

          // Get buyer rebate amount for this agent

          const buyerRebateAmount =
            agent.buyerRebateIncluded === "yes" && agent.buyerRebateAmount
              ? parseFloat(agent.buyerRebateAmount) || 0
              : 0;

          // Determine agent amounts based on trade classification (not agent classification)

          let agentListing = "0.00";

          let agentSelling = "0.00";

          // Use trade classification to determine which column the agent amount goes in

          if (isCoOperatingSide) {
            // For CO-OPERATING SIDE: put agent amount in selling column

            agentListing = "0.00";

            // Apply buyer rebate deduction to selling amount

            agentSelling = (agentCommission - buyerRebateAmount).toFixed(2);
          } else {
            // For LISTING SIDE: put agent amount in listing column

            agentListing = (agentCommission - buyerRebateAmount).toFixed(2);

            agentSelling = "0.00";
          }

          // Calculate agent sub-total, HST, and total

          let agentSubTotal = (
            parseFloat(agentListing) + parseFloat(agentSelling)
          ).toFixed(2);

          // HST is calculated on the original commission amount (before buyer rebate deduction)

          const agentHST = (agentCommission * 0.13).toFixed(2);

          const agentTotal = (
            parseFloat(agentSubTotal) + parseFloat(agentHST)
          ).toFixed(2);

          return {
            ...agent,

            agentListing,

            agentSelling,

            agentSubTotal,

            agentHST,

            agentTotal,
          };
        }
      );

      // Calculate total buyer rebate amounts from all agents

      const totalBuyerRebate = (trade.agentCommissionList || []).reduce(
        (total, agent) => {
          if (agent.buyerRebateIncluded === "yes" && agent.buyerRebateAmount) {
            return total + parseFloat(agent.buyerRebateAmount || 0);
          }

          return total;
        },

        0
      );

      // Determine which column to show buyer rebate based on trade classification

      let buyerRebateListing = "0.00";

      let buyerRebateSelling = "0.00";

      if (isCoOperatingSide) {
        // For CO-OPERATING SIDE: put buyer rebate in selling column

        buyerRebateSelling = (totalBuyerRebate || 0).toFixed(2);
      } else {
        // For LISTING SIDE: put buyer rebate in listing column

        buyerRebateListing = (totalBuyerRebate || 0).toFixed(2);
      }

      // Calculate Net to Office = (Expenses - Agents) - Liabilities

      let netToOfficeListing,
        netToOfficeSelling,
        netToOfficeSubTotal,
        netToOfficeHST,
        netToOfficeTotal;

      // Calculate total agent amounts across all agents

      let totalAgentListing,
        totalAgentSelling,
        totalAgentSubTotal,
        totalAgentHST,
        totalAgentTotal;

      if (!isCoOperatingSide && agentCalculations.length === 2) {
        // For LISTING SIDE with 2 agents: Net to Office = Agent 1 - Agent 2

        const agent1 = agentCalculations[0] || {};

        const agent2 = agentCalculations[1] || {};

        totalAgentListing =
          parseFloat(agent1.agentListing || 0) -
          parseFloat(agent2.agentListing || 0);

        totalAgentSelling =
          parseFloat(agent1.agentSelling || 0) -
          parseFloat(agent2.agentSelling || 0);

        totalAgentSubTotal =
          parseFloat(agent1.agentSubTotal || 0) -
          parseFloat(agent2.agentSubTotal || 0);

        totalAgentHST =
          parseFloat(agent1.agentHST || 0) - parseFloat(agent2.agentHST || 0);

        totalAgentTotal =
          parseFloat(agent1.agentTotal || 0) -
          parseFloat(agent2.agentTotal || 0);
      } else {
        // For all other cases: sum all agents

        totalAgentListing = agentCalculations.reduce(
          (sum, agent) => sum + parseFloat(agent.agentListing || 0),

          0
        );

        totalAgentSelling = agentCalculations.reduce(
          (sum, agent) => sum + parseFloat(agent.agentSelling || 0),

          0
        );

        totalAgentSubTotal = agentCalculations.reduce(
          (sum, agent) => sum + parseFloat(agent.agentSubTotal || 0),

          0
        );

        totalAgentHST = agentCalculations.reduce(
          (sum, agent) => sum + parseFloat(agent.agentHST || 0),

          0
        );

        totalAgentTotal = agentCalculations.reduce(
          (sum, agent) => sum + parseFloat(agent.agentTotal || 0),

          0
        );
      }

      // Net to Office calculation

      if (!isCoOperatingSide && agentCalculations.length === 2) {
        // For LISTING SIDE with 2 agents: Calculate Net to Office based on Plan Amount totals

        // Calculate total Plan Amount from all agents

        const totalPlanAmount = agentCalculations.reduce((total, agent) => {
          const feesDeducted = parseFloat(agent.feesDeducted || 0);

          return total + feesDeducted;
        }, 0);

        // Apply the new formulas:

        // Sub Total = Total of Plan Amount

        netToOfficeSubTotal = totalPlanAmount.toFixed(2);

        // HST = Total of Plan Amount * 13%

        netToOfficeHST = (totalPlanAmount * 0.13).toFixed(2);

        // Total = Sub Total + HST

        netToOfficeTotal = (totalPlanAmount + totalPlanAmount * 0.13).toFixed(
          2
        );

        // For listing side with 2 agents, distribute the amounts appropriately

        // Since this is listing side, put the amounts in listing column

        netToOfficeListing = netToOfficeSubTotal;

        netToOfficeSelling = "0.00";
      } else {
        // For all other cases: Net to Office = (Expenses - Agents) - Liabilities

        // Expenses = Base Office Commission

        // Agents = Total Agent Commission (sum of all agents, or Agent 1 - Agent 2 for LISTING SIDE with 2 agents)

        // Liabilities = Buyer Rebate

        netToOfficeListing = (
          parseFloat(baseOfficeCommissionListing) -
          totalAgentListing -
          parseFloat(buyerRebateListing)
        ).toFixed(2);

        netToOfficeSelling = (
          parseFloat(baseOfficeCommissionSelling) -
          totalAgentSelling -
          parseFloat(buyerRebateSelling)
        ).toFixed(2);

        netToOfficeSubTotal = (
          parseFloat(baseOfficeCommissionSubTotal) -
          totalAgentSubTotal -
          (parseFloat(buyerRebateListing) + parseFloat(buyerRebateSelling))
        ).toFixed(2);

        netToOfficeHST = (
          parseFloat(baseOfficeCommissionHST) - totalAgentHST
        ).toFixed(2);

        netToOfficeTotal = (
          parseFloat(baseOfficeCommissionTotal) -
          totalAgentTotal -
          (parseFloat(buyerRebateListing) + parseFloat(buyerRebateSelling))
        ).toFixed(2);
      }

      // Format the outside brokers data

      const formattedOutsideBrokers =
        trade.commission?.outsideBrokersRows?.map((broker) => {
          const getEndValueForPrint = (b) => {
            // First check the broker's end from outsideBrokers array

            const matchingBroker1 = trade.outsideBrokers?.find((ob) => {
              const outsideBrokerName = `${ob.firstName} ${ob.lastName}`.trim();

              return (
                outsideBrokerName === b.agentName || ob.company === b.brokerage
              );
            });

            // If we found a matching broker in outsideBrokers array, use their end type

            if (matchingBroker1) {
              if (
                matchingBroker1.end?.toLowerCase().includes("listing") ||
                matchingBroker1.type?.toLowerCase().includes("listing")
              ) {
                return "Listing";
              }
            }

            // If no match found or not listing, check the commission broker's end/type

            if (
              b.end?.toLowerCase().includes("listing") ||
              b.type?.toLowerCase().includes("listing")
            ) {
              return "Listing";
            }

            return "Selling";
          };

          return {
            agentName: broker.agentName || "-",

            brokerage: broker.brokerage || "-",

            end: getEndValueForPrint(broker),

            sellingAmount: broker.sellingAmount || "0.00",

            tax: broker.tax || "0.00",

            total: broker.total || "0.00",
          };
        }) || [];

      // Get address information from keyInfo

      const streetNumber = get(trade, "keyInfo.streetNumber") || "";

      const streetName = get(trade, "keyInfo.streetName") || "";

      const unit = get(trade, "keyInfo.unit") || "";

      const city = get(trade, "keyInfo.city") || "";

      const province = get(trade, "keyInfo.province") || "";

      const postalCode = get(trade, "keyInfo.postalCode") || "";

      // Format address for display

      const addressLine1 =
        streetNumber && streetName ? `${streetNumber} ${streetName}` : "";

      const addressLine2 = unit || "";

      const addressLine3 = city && province ? `${city}, ${province}` : "";

      const addressLine4 = postalCode || "";
      const printContent = `

      <!DOCTYPE html>

      <html>

      <head>

        <title>Trade Record Sheet - ${trade.tradeNumber}</title>

        <style>
          /* A4 Optimized Styling - 210mm x 297mm */
          * { box-sizing: border-box; margin: 0; padding: 0; }
          
          body { 
            font-family: Arial, sans-serif; 
            margin: 0;
            padding: 15mm 12mm; /* A4 margins: top/bottom 15mm, left/right 12mm */
            font-size: 10px;
            line-height: 1.4;
            width: 210mm; /* A4 width */
            background: white;
          }

          .header { 
            display: flex; 
            justify-content: space-between; 
            align-items: flex-start; 
            margin-bottom: 1px;
            width: 100%;
          }

          .logo { width: 70px; height: auto; }

          .title { 
            font-size: 16px; 
            font-weight: bold; 
            text-align: center; 
            flex-grow: 1;
            padding: 0 10px;
          }

          .date-address { 
            text-align: right; 
            font-size: 9px;
            line-height: 1.3;
          }

          .date { font-weight: bold; margin-bottom: 4px; }

          .address { line-height: 1.3; }

          .section { 
            margin-bottom: 12px;
            page-break-inside: avoid; /* Prevent sections from breaking across pages */
          }

          .section-title { 
            font-size: 12px; 
            font-weight: bold; 
            margin-bottom: 6px; 
            border-bottom: 1px solid #333; 
            padding-bottom: 10px;
          }

          .property-grid { 
            display: grid; 
            grid-template-columns: 1fr 1fr; 
            gap: 1px; 
            margin-bottom: 8px;
          }

          .property-item { 
            display: flex; 
            justify-content: space-between; 
            font-size: 9px;
            line-height: 1.3;
          }

          .property-label { font-weight: bold; margin-right: 5px; }

          table { 
            width: 100%; 
            border-collapse: collapse; 
            margin-bottom: 8px; 
            font-size: 8px;
            page-break-inside: auto;
          }

          tr { page-break-inside: avoid; page-break-after: auto; }

          th, td { 
            border: 1px solid #ccc; 
            padding: 6px 6px; 
            text-align: left;
            line-height: 1.2;
          }

          th { 
            background-color: #f5f5f5; 
            font-weight: bold;
            font-size: 8px;
          }

          .financial-grid { 
            display: grid; 
            grid-template-columns: 1fr 1fr 1fr; 
            gap: 8px;
            margin-bottom: 10px;
          }

          .financial-item { text-align: center; }

          .financial-label { 
            font-weight: bold; 
            margin-bottom: 3px; 
            font-size: 9px;
          }

          .financial-value { font-size: 12px; font-weight: bold; }

          /* Page break helpers */
          .page-break { page-break-after: always; }
          .no-break { page-break-inside: avoid; }

          @media print {
            body { 
              margin: 0;
              padding: 15mm 12mm;
            }
            .no-print { display: none !important; }
            button { display: none !important; }
          }

        </style>

      </head>

      <body>

        <div class="header">

          <div style="display: flex; flex-direction: column; align-items: flex-start;">

            <img src="/logo.jpeg" alt="Logo" class="logo">

            <div style="font-size: 9px; line-height: 1.2; margin-top: 5px;">

                      Homelife Top Star Realty Inc., Brokerage<br>

      9889 Markham Road, Suite 201 <br>

      Markham, Ontario L6E OB7<br>

        Phone: 905-209-1400

            </div>

          </div>

          <div class="title">Trade Record Sheet</div>

          <div class="date-address">

            <div class="date">${currentDate}</div>

            <div class="address">

              ${addressLine1}<br>

              ${addressLine2}<br>

              ${addressLine3}<br>

              ${addressLine4}

            </div>

            <div style="font-size: 10px; font-weight: bold; margin-top: 5px;">

              Trade Number - ${
                get(trade, "keyInfo.tradeNumber") || trade.tradeNumber || "-"
              }

            </div>

          </div>

        </div>



        <div class="section">

          <div class="section-title">Property Name</div>

          <div class="property-grid">

            <div class="property-item">

              <span class="property-label">Type:</span>

              <span>${get(trade, "keyInfo.propertyType")}</span>

            </div>

            <div class="property-item">

              <span class="property-label">Classification:</span>

              <span>${get(trade, "keyInfo.classification")}</span>

            </div>

            <div class="property-item">

              <span class="property-label">Status:</span>

              <span>${get(trade, "keyInfo.status")}</span>

            </div>

            <div class="property-item">

              <span class="property-label">MLS Number:</span>

              <span>${get(trade, "keyInfo.mlsNumber")}</span>

            </div>

            <div class="property-item">

              <span class="property-label">Offer Date:</span>

              <span>${get(trade, "keyInfo.offerDate")}</span>

            </div>

            <div class="property-item">

              <span class="property-label">Entry Date:</span>

              <span>${get(trade, "keyInfo.entryDate")}</span>

            </div>

            <div class="property-item">

              <span class="property-label">Firm Date:</span>

              <span>${get(trade, "keyInfo.firmDate")}</span>

            </div>

            <div class="property-item">

              <span class="property-label">Close Date:</span>

              <span>${get(trade, "keyInfo.closeDate")}</span>

            </div>

          </div>

        </div>



        <div class="section">

          <div class="section-title">Conditions</div>

          ${
            trade.conditions && trade.conditions.length > 0
              ? `

          <table>

            <thead>

              <tr>

                <th>Condition</th>

                <th>Due Date</th>

                <th>Condition Met Date</th>

              </tr>

            </thead>

            <tbody>

              ${trade.conditions

                .map(
                  (condition) => `

                <tr>

                  <td>${condition.conditionText || "-"}</td>

                  <td>${condition.dueDate || "-"}</td>

                  <td>${condition.conditionMetDate || "Not met"}</td>

                </tr>

              `
                )

                .join("")}

            </tbody>

          </table>

          `
              : "<p>No conditions available.</p>"
          }

        </div>



        <div class="section">

          <div class="section-title">Contacts</div>

          ${
            trade.people && trade.people.length > 0
              ? `

          <table>

            <thead>

              <tr>

                <th>Type</th>

                <th>First Name</th>

                <th>Last Name</th>

                <th>Primary Phone</th>

                <th>Secondary Phone</th>

                <th>Email</th>

                <th>Company Name</th>

              </tr>

            </thead>

            <tbody>

              ${trade.people

                .map(
                  (person) => `

                <tr>

                  <td>${person.type || "-"}</td>

                  <td>${person.firstName || "-"}</td>

                  <td>${person.lastName || "-"}</td>

                  <td>${person.primaryPhone || "-"}</td>

                  <td>${person.secondaryPhone || "-"}</td>

                  <td>${person.email || "-"}</td>

                  <td>${person.companyName || "-"}</td>

                </tr>

              `
                )

                .join("")}

            </tbody>

          </table>

          `
              : "<p>No contacts available.</p>"
          }

        </div>



        <div class="section">

          <div class="section-title">Outside Brokers</div>

          ${
            trade.outsideBrokers && trade.outsideBrokers.length > 0
              ? `

          <table>

            <thead>

              <tr>

                <th>Type</th>

                <th>End</th>

                <th>First Name</th>

                <th>Last Name</th>

                <th>Company</th>

                <th>Phone Number</th>

              </tr>

            </thead>

            <tbody>

              ${trade.outsideBrokers

                .map(
                  (broker) => `

                <tr>

                  <td>${broker.type || "-"}</td>

                  <td>${broker.end || "-"}</td>

                  <td>${broker.firstName || "-"}</td>

                  <td>${broker.lastName || "-"}</td>

                  <td>${broker.company || "-"}</td>

                  <td>${broker.primaryPhone || "-"}</td>

                </tr>

              `
                )

                .join("")}

            </tbody>

          </table>

          `
              : "<p>No outside brokers available.</p>"
          }

        </div>



        <div class="section">

          <div class="section-title">Outside Brokers Commission Details</div>

          ${
            formattedOutsideBrokers.length > 0
              ? `

          <table>

            <thead>

              <tr>

                <th>Agent Name</th>

                <th>Brokerage</th>

                <th>End</th>

                <th>Selling Amount</th>

                <th>Tax</th>

                <th>Total</th>

              </tr>

            </thead>

            <tbody>

              ${formattedOutsideBrokers

                .map(
                  (broker) => `

                <tr>

                  <td>${broker.agentName}</td>

                  <td>${broker.brokerage}</td>

                  <td>${broker.end}</td>

                  <td>${formatCurrency(broker.sellingAmount)}</td>

                  <td>${formatCurrency(broker.tax)}</td>

                  <td>${formatCurrency(broker.total)}</td>

                </tr>

              `
                )

                .join("")}

            </tbody>

          </table>

          `
              : "<p>No outside brokers commission details available.</p>"
          }

        </div>



        <div class="section">

          <div class="section-title">Deposit</div>

          ${
            trade.trustRecords && trade.trustRecords.length > 0
              ? `

          <table>

            <thead>

              <tr>

                <th>We Hold</th>

                <th>Received</th>

                <th>Received From</th>

                <th>Held By</th>

                <th>Deposit Date</th>

                <th>Reference</th>

                <th>Amount</th>

                <th>Payment Type</th>

              </tr>

            </thead>

            <tbody>

              ${trade.trustRecords

                .map(
                  (record) => `

                <tr>

                  <td>${record.weHold || "-"}</td>

                  <td>${record.received || "-"}</td>

                  <td>${record.receivedFrom || "-"}</td>

                  <td>${record.heldBy || "-"}</td>

                  <td>${record.depositDate || record.date || "-"}</td>

                  <td>${record.reference || "-"}</td>

                  <td>${formatCurrency(record.amount || 0)}</td>

                  <td>${record.paymentType || "-"}</td>

                </tr>

              `
                )

                .join("")}

            </tbody>

          </table>

          `
              : "<p>No deposit records available.</p>"
          }

        </div>



        <div class="section">

          <div class="section-title">Financial</div>

          <div style="font-weight:bold; font-size:12px; margin-bottom:4px;">Financial:</div>

          <div style="margin-bottom:4px; font-size:10px;">

            <div>Selling Price: <span style="font-weight:bold;">${formatCurrency(
              commissionIncome.sellPrice || trade.keyInfo?.sellPrice || 0
            )}</span></div>

          </div>

          <div style="margin-bottom:4px; font-size:10px;">

            <div>Listing Commission: <span style="font-weight:bold;">${parseFloat(
              trade.keyInfo?.listCommission || 0
            )}%</span></div>

          </div>

          <div style="margin-bottom:4px; font-size:10px;">

            <div>Selling Commission: <span style="font-weight:bold;">${parseFloat(
              trade.keyInfo?.sellCommission || 0
            )}%</span></div>

          </div>

          <div style="display:flex; font-weight:bold; border-bottom:1px solid #ccc; padding:10px 0; border-top:1px solid #ccc; font-size:9px;">

            <div style="width:25%"></div>

            <div style="width:12%; text-align:center;">Listing</div>

            <div style="width:12%; text-align:center;">Selling</div>

            <div style="width:12%; text-align:center;">Sub-Total</div>

            <div style="width:12%; text-align:center;">HST</div>

            <div style="width:12%; text-align:center;">Total</div>

          </div>

          <div style="font-weight:bold; margin-top:6px; margin-bottom:0; font-size:10px;">Income</div>

          <div style="display:flex; border-bottom:1px solid #ccc; padding:3px 0; font-size:9px;">

            <div style="width:25%">Commission</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              listingAmount
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              sellingAmount
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              subTotal
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              hst
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              total
            )}</div>

          </div>

          ${
            isCoOperatingSide
              ? `

          <div style="display:flex; padding:3px 0; font-size:9px;">

            <div style="width:25%">Base Office Commission</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              baseOfficeCommissionListing
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              baseOfficeCommissionSelling
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              baseOfficeCommissionSubTotal
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              baseOfficeCommissionHST
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              baseOfficeCommissionTotal
            )}</div>

          </div>

          `
              : `

          <div style="font-weight:bold; margin-top:6px; font-size:10px;">Expenses</div>

          <div style="display:flex; border-bottom:1px solid #ccc; padding:3px 0; font-size:9px;">

            <div style="width:25%">${obName}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              obListing
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              obSelling
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              obSubTotal
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              obTax
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              obTotal
            )}</div>

          </div>

          <div style="display:flex; border-bottom:1px solid #ccc; padding:3px 0; font-size:9px;">

            <div style="width:25%">Base Office Commission</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              baseOfficeCommissionListing
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              baseOfficeCommissionSelling
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              baseOfficeCommissionSubTotal
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              baseOfficeCommissionHST
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              baseOfficeCommissionTotal
            )}</div>

          </div>

          `
          }

          <div style="font-weight:bold; margin-top:6px; font-size:10px;">Agents</div>

          ${agentCalculations

            .map(
              (agent) => `

          <div style="display:flex; border-bottom:1px solid #ccc; padding:3px 0; font-size:9px;">

            <div style="width:25%">(${agent.agentId || ""}) ${
                agent.agentName || ""
              }</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              agent.agentListing || "0.00"
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              agent.agentSelling || "0.00"
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              agent.agentSubTotal || "0.00"
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              agent.agentHST || "0.00"
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              agent.agentTotal || "0.00"
            )}</div>

          </div>

          `
            )

            .join("")}

          

          <!-- Liabilities Section -->

          ${
            totalBuyerRebate > 0
              ? `

          <div style="font-weight:bold; margin-top:6px; font-size:10px;">Liabilities</div>

          <div style="display:flex; border-bottom:1px solid #ccc; padding:3px 0; font-size:9px;">

            <div style="width:25%">Buyer Rebate</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              buyerRebateListing
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              buyerRebateSelling
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              (
                parseFloat(buyerRebateListing) + parseFloat(buyerRebateSelling)
              ).toFixed(2)
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              "0.00"
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              (
                parseFloat(buyerRebateListing) + parseFloat(buyerRebateSelling)
              ).toFixed(2)
            )}</div>

          </div>

          `
              : ""
          }

          <div style="font-weight:bold; margin-top:6px; font-size:10px;">Net to Office</div>

          <div style="display:flex; border-bottom:3px double #000; padding:10px 0; font-size:9px;">

            <div style="width:25%"></div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              netToOfficeListing
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              netToOfficeSelling
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              netToOfficeSubTotal
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              netToOfficeHST
            )}</div>

            <div style="width:12%; text-align:center;">${formatCurrency(
              netToOfficeTotal
            )}</div>

          </div>

        </div>



        <div class="section">

          <div class="section-title">Agent Details</div>

          ${
            trade.agentCommissionList && trade.agentCommissionList.length > 0
              ? `

          <table style="width:100%; border-collapse:collapse; margin-bottom:10px;">

            <thead>

              <tr style="background-color:#f2f2f2;">

                <th style="border:1px solid #ddd; padding:4px; text-align:left;">Agent Name</th>

                <th style="border:1px solid #ddd; padding:4px; text-align:left;">Agent Number</th>

                <th style="border:1px solid #ddd; padding:4px; text-align:left;">Payment Plan</th>

                <th style="border:1px solid #ddd; padding:4px; text-align:left;">Agent Base</th>

                <th style="border:1px solid #ddd; padding:4px; text-align:left;">Plan Amount</th>

                <th style="border:1px solid #ddd; padding:4px; text-align:left;">Buyer Rebate</th>

                <th style="border:1px solid #ddd; padding:4px; text-align:left;">Total</th>

              </tr>

            </thead>

            <tbody>

              ${trade.agentCommissionList

                .map(
                  (agent) => `

                <tr>

                  <td style="border:1px solid #ddd; padding:4px;">${
                    agent.agentName || "-"
                  }</td>

                  <td style="border:1px solid #ddd; padding:4px;">${
                    agent.agentId || "-"
                  }</td>

                  <td style="border:1px solid #ddd; padding:4px;">${
                    getPaymentPlanDisplayName(agent.feeInfo) || "-"
                  }</td>

                  <td style="border:1px solid #ddd; padding:4px;">${formatCurrency(
                    agent.amount || 0
                  )}</td>

                  <td style="border:1px solid #ddd; padding:4px;">${formatCurrency(
                    agent.feesDeducted || 0
                  )}</td>

                  <td style="border:1px solid #ddd; padding:4px;">${
                    agent.buyerRebateIncluded === "yes" &&
                    agent.buyerRebateAmount
                      ? formatCurrency(agent.buyerRebateAmount)
                      : "-"
                  }</td>

                  <td style="border:1px solid #ddd; padding:4px;">${formatCurrency(
                    parseFloat(agent.amount || 0) -
                      parseFloat(agent.feesDeducted || 0) -
                      (agent.buyerRebateIncluded === "yes" &&
                      agent.buyerRebateAmount
                        ? parseFloat(agent.buyerRebateAmount || 0)
                        : 0)
                  )}</td>

                </tr>

              `
                )

                .join("")}

            </tbody>

          </table>

          `
              : "<p>No agent payment details available.</p>"
          }

        </div>

        <br/><br/><br/><br/><br/><br/><br/>
        <div class="section">

          <div class="section-title">Trust Activity</div>

          ${
            trade.trustRecords && trade.trustRecords.length > 0
              ? `<table><thead><tr>

                  <th>Received From</th><th>Deposit Date</th><th>Reference</th><th>Amount</th>

                </tr></thead><tbody>

                ${trade.trustRecords

                  .map(
                    (record) => `<tr>

                      <td>${record.receivedFrom || "-"}</td>

                      <td>${record.depositDate || record.date || "-"}</td>

                      <td>${record.reference || "-"}</td>

                      <td>${formatCurrency(record.amount || 0)}</td>

                    </tr>`
                  )

                  .join("")}

                </tbody></table>`
              : `<div class="text-gray-500">No trust records available.</div>`
          }

        </div>



        <div class="section">

          <div class="section-title">Real Estate Trust Payments</div>

          ${
            realEstateTrustEFTs.length > 0
              ? `<table><thead><tr>

                  <th>EFT #</th><th>Date</th><th>Amount</th><th>Recipient</th><th>Type</th><th>Description</th>

                </tr></thead><tbody>

                ${realEstateTrustEFTs

                  .map(
                    (eft) => `<tr>

                      <td>${eft.eftNumber || ""}</td>

                      <td>${
                        eft.chequeDate || eft.date
                          ? new Date(
                              eft.chequeDate || eft.date
                            ).toLocaleDateString()
                          : "-"
                      }</td>

                      <td>${formatCurrency(eft.amount || "")}</td>

                      <td>${eft.recipient || ""}</td>

                      <td>${getEFTTypeDisplayName(eft.type) || ""}</td>

                      <td>${eft.description || ""}</td>

                    </tr>`
                  )

                  .join("")}

                </tbody></table>`
              : `<div class="text-gray-500">No Real Estate Trust Payments found for this trade.</div>`
          }

        </div>



        <div class="section">

          <div class="section-title">Commission Trust Payments</div>

          ${
            commissionTrustEFTs.length > 0
              ? `<table><thead><tr>

                  <th>EFT #</th><th>Date</th><th>Amount</th><th>Recipient</th><th>Type</th><th>Description</th>

                </tr></thead><tbody>

                ${commissionTrustEFTs

                  .map(
                    (eft) => `<tr>

                      <td>${eft.eftNumber || ""}</td>

                      <td>${
                        eft.chequeDate || eft.date
                          ? new Date(
                              eft.chequeDate || eft.date
                            ).toLocaleDateString()
                          : "-"
                      }</td>

                      <td>${formatCurrency(eft.amount || "")}</td>

                      <td>${eft.recipient || ""}</td>

                      <td>${getEFTTypeDisplayName(eft.type) || ""}</td>

                      <td>${eft.description || ""}</td>

                    </tr>`
                  )

                  .join("")}

                </tbody></table>`
              : `<div class="text-gray-500">No Commission Trust Payments found for this trade.</div>`
          }

        </div>



        <div class="section">

          <div class="section-title">Commission Trust Agreement</div>

          <div style="margin-bottom: 15px; font-size: 10px; line-height: 1.4;">

            It is understood between all parties that this agreement shall constitute a Commission Trust Agreement as set out in the contract.

          </div>

          <div style="margin-bottom: 15px; font-size: 10px; line-height: 1.4;">

            To the best of my knowledge the above information is correct. Dated at Moncton on ${currentDate}

          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">

            <div style="font-size: 10px;">

              ${
                agentCalculations.length > 0
                  ? `${agentCalculations[0].agentName || "Agent Name"}, ${
                      agentCalculations[0].agentId || "Agent Number"
                    }`
                  : "Agent Name, Agent Number"
              }

            </div>

            <div style="border-bottom: 1px solid #000; width: 200px; height: 20px;"></div>

          </div>

          <div style="display: flex; justify-content: space-between; align-items: center;">

            <div style="font-size: 10px;">

              Broker of Record: Homelife Top Star Realty Inc., Brokerage

            </div>

            <div style="border-bottom: 1px solid #000; width: 200px; height: 20px;"></div>
          </div>
        </div>
      </body>
      </html>

    `;

      // Write content to iframe
      iframeDoc.open();
      iframeDoc.write(printContent);
      iframeDoc.close();

      // Wait for content to load
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Generate PDF using our utility
      console.log("🔄 Converting HTML to PDF...");
      const pdfBlob = await generatePDFFromElement(
        iframeDoc.body,
        `Trade_${trade.tradeNumber}.pdf`
      );

      console.log(
        "✅ PDF generated, size:",
        Math.round(pdfBlob.size / 1024),
        "KB"
      );

      // Clean up iframe
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }

      if (pdfBlob.size < 500) {
        throw new Error("PDF generated but appears to be empty");
      }

      // Convert PDF to base64
      const base64 = await blobToBase64(pdfBlob);
      const pdfBase64 = `data:application/pdf;base64,${base64}`;
      const fileName = `Trade_${trade.tradeNumber}_${Date.now()}.pdf`;

      console.log("📤 Uploading PDF to Dropbox...");

      let currentAccessToken = dropboxAccessToken;

      // Try to upload with current token
      try {
        const response = await axiosInstance.post(
          "/dropbox/upload-pdf-to-dropbox",
          {
            pdfBase64: pdfBase64,
            fileName: fileName,
            accessToken: currentAccessToken,
          }
        );

        if (response.data.success) {
          alert(
            `✅ SUCCESS!\n\nPDF uploaded to Dropbox!\n\nFile: ${
              response.data.file.name
            }\nSize: ${Math.round(pdfBlob.size / 1024)} KB\nPath: ${
              response.data.file.path
            }`
          );
          setIsUploadingToDropbox(false);
          return;
        }
      } catch (uploadError) {
        // Check if token expired
        if (
          uploadError.response?.status === 401 ||
          uploadError.response?.data?.needsTokenRefresh
        ) {
          console.log("🔄 Token expired, refreshing...");

          const refreshToken = localStorage.getItem("dropboxRefreshToken");
          if (refreshToken) {
            try {
              const refreshResponse = await axiosInstance.post(
                "/dropbox/refresh-token",
                {
                  refreshToken: refreshToken,
                }
              );

              if (refreshResponse.data.success) {
                const newAccessToken = refreshResponse.data.accessToken;
                localStorage.setItem("dropboxAccessToken", newAccessToken);
                setDropboxAccessToken(newAccessToken);

                console.log("✅ Token refreshed, retrying upload...");

                // Retry with new token
                const retryResponse = await axiosInstance.post(
                  "/dropbox/upload-pdf-to-dropbox",
                  {
                    pdfBase64: pdfBase64,
                    fileName: fileName,
                    accessToken: newAccessToken,
                  }
                );

                if (retryResponse.data.success) {
                  alert(
                    `✅ SUCCESS!\n\nPDF uploaded to Dropbox!\n\nFile: ${
                      retryResponse.data.file.name
                    }\nSize: ${Math.round(pdfBlob.size / 1024)} KB\nPath: ${
                      retryResponse.data.file.path
                    }`
                  );
                  setIsUploadingToDropbox(false);
                  return;
                }
              }
            } catch (refreshError) {
              console.error("Token refresh failed:", refreshError);
              localStorage.removeItem("dropboxAccessToken");
              localStorage.removeItem("dropboxRefreshToken");
              setDropboxAccessToken(null);
              setDropboxRefreshToken(null);
              alert(
                '❌ Session expired. Please click "Send to Dropbox" to re-authenticate.'
              );
              setIsUploadingToDropbox(false);
              return;
            }
          } else {
            localStorage.removeItem("dropboxAccessToken");
            setDropboxAccessToken(null);
            alert(
              '❌ Session expired. Please click "Send to Dropbox" again to re-authenticate.'
            );
            setIsUploadingToDropbox(false);
            return;
          }
        }

        // If not 401, show the error
        console.error("Upload error:", uploadError);
        alert(
          `❌ Upload failed: ${
            uploadError.response?.data?.message || uploadError.message
          }`
        );
        setIsUploadingToDropbox(false);
      }
    } catch (error) {
      console.error("PDF generation error:", error);
      alert(`❌ Error: ${error.message || "Failed to generate PDF"}`);
      setIsUploadingToDropbox(false);
    }
  };

  // Helper to generate transaction details for this trade
  const getTransactionDetails = () => {
    // You may want to adjust these values to match your backend logic

    const commissionIncome = trade.commission?.commissionIncomeRows?.[0] || {};

    const firstAgent = trade.agentCommissionList?.[0] || {};

    const address = `${get(trade, "keyInfo.streetNumber") || ""} ${
      get(trade, "keyInfo.streetName") || ""
    }`.trim();

    const commissionDescription = `Trade #${trade.tradeNumber} - ${address}`;

    const commissionDate = get(trade, "keyInfo.closeDate") || "-";

    const totalFees = parseFloat(firstAgent.feesDeducted || 0);

    const hstInputTaxCredit =
      parseFloat(commissionIncome.sellingAmount || 0) * 0.13;

    const agentAmount = parseFloat(firstAgent.amount || 0);

    const agentNetCommission = parseFloat(firstAgent.netCommission || 0);

    const feesDeducted = parseFloat(firstAgent.feesDeducted || 0);

    const totalFeesWithTax = feesDeducted + feesDeducted * 0.13;

    // Main 8 transactions

    const mainTxns = [
      {
        date: commissionDate,

        accountNumber: "40100",

        accountName: "Commission Income",

        debit: "",

        credit: commissionIncome.listingAmount,

        description: commissionDescription,
      },

      {
        date: commissionDate,

        accountNumber: "23001",

        accountName: "HST Input Tax Credit",

        debit: commissionIncome.sellingAmount * 0.13,

        credit: "",

        description: commissionDescription,
      },

      {
        date: commissionDate,

        accountNumber: "23000",

        accountName: "HST Collected",

        debit: "",

        credit: commissionIncome.sellingAmount * 0.13,

        description: commissionDescription,
      },

      {
        date: commissionDate,

        accountNumber: "50100",

        accountName: "Agent's Commission",

        debit: agentAmount,

        credit: "",

        description: commissionDescription,
      },

      {
        date: commissionDate,

        accountNumber: "21500",

        accountName: "Commission Payable",

        debit: "",

        credit: agentNetCommission,

        description: commissionDescription,
      },

      {
        date: commissionDate,

        accountNumber: "44100",

        accountName: "Fee Deducted Income",

        debit: "",

        credit: feesDeducted,

        description: commissionDescription,
      },

      {
        date: commissionDate,

        accountNumber: "23001",

        accountName: "HST Input Tax Credit",

        debit: "",

        credit: (totalFeesWithTax - feesDeducted).toFixed(2),

        description: commissionDescription,
      },

      {
        date: commissionDate,

        accountNumber: "12200",

        accountName: "A/R - Commission From Deals",

        debit: commissionIncome.listingAmount
          ? (
              parseFloat(commissionIncome.listingAmount) + hstInputTaxCredit
            ).toFixed(2)
          : "",

        credit: "",

        description: commissionDescription,
      },
    ];

    // Next 2 transactions (Payment Received)

    const paymentTxns = [
      {
        date: commissionDate,

        accountNumber: "10004",

        accountName: "CASH - COMMISSION TRUST ACCOUNT",

        debit: agentNetCommission,

        credit: "",

        description: `Trade #${trade.tradeNumber}, Paid to: Agent`,
      },

      {
        date: commissionDate,

        accountNumber: "21500",

        accountName: "Commission Payable",

        debit: agentNetCommission,

        credit: "",

        description: `Trade #${trade.tradeNumber}, Paid to: Agent`,
      },

      {
        date: commissionDate,

        accountNumber: "10004",

        accountName: "CASH - COMMISSION TRUST ACCOUNT",

        debit: feesDeducted,

        credit: "",

        description: `Trade #${trade.tradeNumber}, Paid to: Homelife Top Star Realty Inc., Brokerage`,
      },

      {
        date: commissionDate,

        accountNumber: "10001",

        accountName: "CASH - CURRENT ACCOUNT",

        debit: "",

        credit: feesDeducted,

        description: `Trade #${trade.tradeNumber}, Paid to: Homelife Top Star Realty Inc., Brokerage`,
      },
    ];

    return { mainTxns, paymentTxns };
  };

  // EFTPaymentTables component for displaying EFT tables

  const EFTPaymentTables = ({ trade }) => {
    const [realEstateTrustEFTs, setRealEstateTrustEFTs] = useState([]);

    const [commissionTrustEFTs, setCommissionTrustEFTs] = useState([]);

    const [generalAccountEFTs, setGeneralAccountEFTs] = useState([]);

    const [loading, setLoading] = useState(false);

    const [error, setError] = useState("");

    useEffect(() => {
      if (!trade || !trade._id) return;

      setLoading(true);

      setError("");

      // Fetch Real Estate Trust EFTs

      axiosInstance

        .get(`/real-estate-trust-eft/trade/${trade._id}`)

        .then((res) => setRealEstateTrustEFTs(res.data))

        .catch(() => setRealEstateTrustEFTs([]));

      // Fetch Commission Trust EFTs

      axiosInstance

        .get(`/commission-trust-eft/trade/${trade._id}`)

        .then((res) => setCommissionTrustEFTs(res.data))

        .catch(() => setCommissionTrustEFTs([]));

      // For General Account EFTs, we need a vendorId (not directly available from trade)

      // If you have a way to relate trade to vendor, add logic here. For now, leave empty.

      setLoading(false);
    }, [trade]);

    return (
      <div className="mb-8">
        {/* Real Estate Trust Payments Table */}

        <div className="mb-6">
          <h3 className="font-semibold text-lg mb-2">
            Real Estate Trust Payments
          </h3>

          {realEstateTrustEFTs.length > 0 ? (
            <table className="min-w-full border border-gray-300 mb-2 text-sm">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left bg-gray-100 border">
                    EFT #
                  </th>

                  <th className="px-2 py-1 text-left bg-gray-100 border">
                    Date
                  </th>

                  <th className="px-2 py-1 text-left bg-gray-100 border">
                    Amount
                  </th>

                  <th className="px-2 py-1 text-left bg-gray-100 border">
                    Recipient
                  </th>

                  <th className="px-2 py-1 text-left bg-gray-100 border">
                    Type
                  </th>

                  <th className="px-2 py-1 text-left bg-gray-100 border">
                    Description
                  </th>
                </tr>
              </thead>

              <tbody>
                {realEstateTrustEFTs.map((eft) => (
                  <tr key={eft._id}>
                    <td className="border px-2 py-1">{eft.eftNumber}</td>

                    <td className="border px-2 py-1">
                      {eft.chequeDate || eft.date
                        ? new Date(
                            eft.chequeDate || eft.date
                          ).toLocaleDateString()
                        : "-"}
                    </td>

                    <td className="border px-2 py-1">
                      {formatCurrency(eft.amount)}
                    </td>

                    <td className="border px-2 py-1">{eft.recipient}</td>

                    <td className="border px-2 py-1">
                      {getEFTTypeDisplayName(eft.type)}
                    </td>

                    <td className="border px-2 py-1">{eft.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-gray-500">
              No Real Estate Trust Payments found for this trade.
            </div>
          )}
        </div>

        {/* Commission Trust Payments Table */}

        <div className="mb-6">
          <h3 className="font-semibold text-lg mb-2">
            Commission Trust Payments
          </h3>

          {commissionTrustEFTs.length > 0 ? (
            <table className="min-w-full border border-gray-300 mb-2 text-sm">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left bg-gray-100 border">
                    EFT #
                  </th>

                  <th className="px-2 py-1 text-left bg-gray-100 border">
                    Date
                  </th>

                  <th className="px-2 py-1 text-left bg-gray-100 border">
                    Amount
                  </th>

                  <th className="px-2 py-1 text-left bg-gray-100 border">
                    Recipient
                  </th>

                  <th className="px-2 py-1 text-left bg-gray-100 border">
                    Type
                  </th>

                  <th className="px-2 py-1 text-left bg-gray-100 border">
                    Description
                  </th>
                </tr>
              </thead>

              <tbody>
                {commissionTrustEFTs.map((eft) => (
                  <tr key={eft._id}>
                    <td className="border px-2 py-1">{eft.eftNumber}</td>

                    <td className="border px-2 py-1">
                      {eft.chequeDate || eft.date
                        ? new Date(
                            eft.chequeDate || eft.date
                          ).toLocaleDateString()
                        : "-"}
                    </td>

                    <td className="border px-2 py-1">
                      {formatCurrency(eft.amount)}
                    </td>

                    <td className="border px-2 py-1">{eft.recipient}</td>

                    <td className="border px-2 py-1">
                      {getEFTTypeDisplayName(eft.type)}
                    </td>

                    <td className="border px-2 py-1">{eft.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="text-gray-500">
              No Commission Trust Payments found for this trade.
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-4xl w-full relative overflow-y-auto max-h-[90vh]">
        {/* Top-right action buttons */}

        <div className="flex gap-3 absolute top-4 right-6 z-10">
          <button
            onClick={handlePrint}
            disabled={isPrinting}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPrinting ? "Generating..." : "Print"}
          </button>

          <button
            onClick={handleDropboxUpload}
            disabled={isUploadingToDropbox}
            className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isUploadingToDropbox ? (
              <>
                <svg
                  className="animate-spin h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Uploading...
              </>
            ) : (
              <>
                <svg
                  className="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M17.464 6.56c-.37-.33-.888-.33-1.32 0L12 10.7 7.84 6.56c-.43-.33-.95-.33-1.32 0-.37.33-.37.86 0 1.19l4.72 4.72c.18.18.43.28.68.28s.5-.1.68-.28l4.72-4.72c.37-.33.37-.86.06-1.19zM12 15.5c-2.33 0-4.47-.82-6.14-2.18l-.01.01A8.02 8.02 0 0112 4c3.87 0 7.13 2.75 7.9 6.4.13.64.2 1.3.2 1.98 0 4.42-3.58 8-8 8zm0-18C5.93-2.5.93 2.5.93 8.57c0 2.77 1.02 5.3 2.71 7.24 0 0 0 .01.01.01 1.92 2.21 4.72 3.6 7.85 3.6 5.8 0 10.5-4.7 10.5-10.5C21.93 3.08 17.43-1.42 12-1.42z" />
                </svg>
                Send to Dropbox
              </>
            )}
          </button>

          <button
            onClick={() => setShowEditModal(true)}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition-colors"
          >
            Edit
          </button>

          <button
            className="text-2xl text-gray-500 hover:text-gray-700 px-2"
            onClick={onClose}
            style={{ lineHeight: 1 }}
          >
            &times;
          </button>
        </div>

        {showEditModal ? (
          <TradeEditModal
            trade={trade}
            onClose={() => setShowEditModal(false)}
            onUpdate={onUpdate}
          />
        ) : (
          <>
            <h2 className="text-2xl font-bold mb-6 text-yellow-700 mt-8">
              Trade Details: #{trade.tradeNumber}
            </h2>

            {/* Address Section */}

            <div className="mb-4">
              <h3 className="font-semibold text-lg mb-2">Address</h3>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div>
                  <span className="text-gray-500 font-normal">Street #</span>

                  <br />

                  {get(trade, "keyInfo.streetNumber")}
                </div>

                <div>
                  <span className="text-gray-500 font-normal">Street Name</span>

                  <br />

                  {get(trade, "keyInfo.streetName")}
                </div>

                <div>
                  <span className="text-gray-500 font-normal">Unit</span>

                  <br />

                  {get(trade, "keyInfo.unit")}
                </div>

                <div>
                  <span className="text-gray-500 font-normal">City</span>

                  <br />

                  {get(trade, "keyInfo.city")}
                </div>

                <div>
                  <span className="text-gray-500 font-normal">Province</span>

                  <br />

                  {get(trade, "keyInfo.province")}
                </div>

                <div>
                  <span className="text-gray-500 font-normal">Postal Code</span>

                  <br />

                  {get(trade, "keyInfo.postalCode")}
                </div>
              </div>
            </div>

            {/* Dates Section */}

            <div className="mb-4">
              <h3 className="font-semibold text-lg mb-2">Important Dates</h3>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div>
                  <span className="text-gray-500 font-normal">Offer Date</span>

                  <br />

                  {get(trade, "keyInfo.offerDate")}
                </div>

                <div>
                  <span className="text-gray-500 font-normal">Firm Date</span>

                  <br />

                  {get(trade, "keyInfo.firmDate")}
                </div>

                <div>
                  <span className="text-gray-500 font-normal">Close Date</span>

                  <br />

                  {get(trade, "keyInfo.closeDate")}
                </div>

                <div>
                  <span className="text-gray-500 font-normal">Entry Date</span>

                  <br />

                  {get(trade, "keyInfo.entryDate")}
                </div>

                <div>
                  <span className="text-gray-500 font-normal">
                    Finalized Date
                  </span>

                  <br />

                  {get(trade, "keyInfo.finalizedDate")}
                </div>
              </div>
            </div>

            {/* Key Information Section */}

            <div className="mb-4">
              <h3 className="font-semibold text-lg mb-2">Key Information</h3>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div>
                  <span className="text-gray-500 font-normal">
                    Listing Number
                  </span>

                  <br />

                  {get(trade, "keyInfo.listingNumber")}
                </div>

                <div>
                  <span className="text-gray-500 font-normal">Sell Price</span>

                  <br />

                  {get(trade, "keyInfo.sellPrice")}
                </div>

                <div>
                  <span className="text-gray-500 font-normal">
                    Classification
                  </span>

                  <br />

                  {get(trade, "keyInfo.classification")}
                </div>

                <div>
                  <span className="text-gray-500 font-normal">Firm</span>

                  <br />

                  {get(trade, "keyInfo.firm")}
                </div>
              </div>
            </div>

            {/* Commission */}

            <div className="mb-4">
              <h3 className="font-semibold text-lg mb-2">Commission</h3>

              <div className="grid grid-cols-2 md:grid-cols-2 gap-2">
                <div>
                  <span className="text-gray-500 font-normal">List %</span>

                  <br />

                  {get(trade, "keyInfo.listCommission")}
                </div>

                <div>
                  <span className="text-gray-500 font-normal">Sell %</span>

                  <br />

                  {get(trade, "keyInfo.sellCommission")}
                </div>
              </div>
            </div>

            {/* Property Details */}

            <div className="mb-4">
              <h3 className="font-semibold text-lg mb-2">Property Details</h3>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                <div>
                  <span className="text-gray-500 font-normal">
                    Property Type
                  </span>

                  <br />

                  {get(trade, "keyInfo.propertyType")}
                </div>

                <div>
                  <span className="text-gray-500 font-normal">Status</span>

                  <br />

                  {get(trade, "keyInfo.status")}
                </div>

                <div>
                  <span className="text-gray-500 font-normal">MLS #</span>

                  <br />

                  {get(trade, "keyInfo.mlsNumber")}
                </div>

                <div>
                  <span className="text-gray-500 font-normal">We Manage</span>

                  <br />

                  {get(trade, "keyInfo.weManage")}
                </div>
              </div>
            </div>

            {/* People Information Section */}

            <div className="mb-6">
              <h3 className="font-semibold text-lg mb-2">People Information</h3>

              {trade.people && trade.people.length > 0 ? (
                <table className="min-w-full border border-gray-300 mb-2 text-sm">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Type
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        First Name
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Last Name
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Primary Phone
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Secondary Phone
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Email
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Company Name
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {trade.people.map((person, idx) => (
                      <tr key={idx}>
                        <td className="border px-2 py-1">{person.type}</td>

                        <td className="border px-2 py-1">
                          {person.firstName || "-"}
                        </td>

                        <td className="border px-2 py-1">
                          {person.lastName || "-"}
                        </td>

                        <td className="border px-2 py-1">
                          {person.primaryPhone || "-"}
                        </td>

                        <td className="border px-2 py-1">
                          {person.secondaryPhone || "-"}
                        </td>

                        <td className="border px-2 py-1">
                          {person.email || "-"}
                        </td>

                        <td className="border px-2 py-1">
                          {person.companyName || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-gray-500">
                  No people information available.
                </div>
              )}
            </div>

            {/* Outside Brokers Section */}

            <div className="mb-6">
              <h3 className="font-semibold text-lg mb-2">Outside Brokers</h3>

              {trade.outsideBrokers && trade.outsideBrokers.length > 0 ? (
                <table className="min-w-full border border-gray-300 mb-2 text-sm">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Type
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        End
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        First Name
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Last Name
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Company
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Phone Number
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {trade.outsideBrokers.map((broker, idx) => (
                      <tr key={idx}>
                        <td className="border px-2 py-1">
                          {broker.type || "-"}
                        </td>

                        <td className="border px-2 py-1">
                          {broker.end || "-"}
                        </td>

                        <td className="border px-2 py-1">
                          {broker.firstName || "-"}
                        </td>

                        <td className="border px-2 py-1">
                          {broker.lastName || "-"}
                        </td>

                        <td className="border px-2 py-1">
                          {broker.company || "-"}
                        </td>

                        <td className="border px-2 py-1">
                          {broker.primaryPhone || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-gray-500">
                  No outside brokers information available.
                </div>
              )}
            </div>

            {/* Outside Brokers Commission Details Section */}

            <div className="mb-6">
              <h3 className="font-semibold text-lg mb-2">
                Outside Brokers Commission Details
              </h3>

              {trade.commission &&
              trade.commission.outsideBrokersRows &&
              trade.commission.outsideBrokersRows.length > 0 ? (
                <table className="min-w-full border border-gray-300 mb-2 text-sm">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Agent Name
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Brokerage
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        End
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Selling Amount
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Tax
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Total
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {trade.commission.outsideBrokersRows.map((broker, idx) => {
                      const getEndValueForPrint = (b) => {
                        // First check the broker's end from outsideBrokers array

                        const matchingBroker1 = trade.outsideBrokers?.find(
                          (ob) => {
                            const outsideBrokerName =
                              `${ob.firstName} ${ob.lastName}`.trim();

                            return (
                              outsideBrokerName === b.agentName ||
                              ob.company === b.brokerage
                            );
                          }
                        );

                        // If we found a matching broker in outsideBrokers array, use their end type

                        if (matchingBroker1) {
                          if (
                            matchingBroker1.end

                              ?.toLowerCase()

                              .includes("listing") ||
                            matchingBroker1.type

                              ?.toLowerCase()

                              .includes("listing")
                          ) {
                            return "Listing";
                          }
                        }

                        // If no match found or not listing, check the commission broker's end/type

                        if (
                          b.end?.toLowerCase().includes("listing") ||
                          b.type?.toLowerCase().includes("listing")
                        ) {
                          return "Listing";
                        }

                        return "Selling";
                      };

                      return (
                        <tr key={idx}>
                          <td className="border px-2 py-1">
                            {broker.agentName || "-"}
                          </td>

                          <td className="border px-2 py-1">
                            {broker.brokerage || "-"}
                          </td>

                          <td className="border px-2 py-1">
                            {getEndValueForPrint(broker)}
                          </td>

                          <td className="border px-2 py-1">
                            {formatCurrency(broker.sellingAmount)}
                          </td>

                          <td className="border px-2 py-1">
                            {formatCurrency(broker.tax)}
                          </td>

                          <td className="border px-2 py-1">
                            {formatCurrency(broker.total)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="text-gray-500">
                  No outside brokers commission details available.
                </div>
              )}
            </div>

            {/* Trust Records Section */}

            <div className="mb-6">
              <h3 className="font-semibold text-lg mb-2">Trust Records</h3>

              {trade.trustRecords && trade.trustRecords.length > 0 ? (
                <table className="min-w-full border border-gray-300 mb-2 text-sm">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        We Hold
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Received
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Received From
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Held By
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Deposit Date
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Reference
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Amount
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Payment Type
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {trade.trustRecords.map((t, idx) => (
                      <tr key={idx}>
                        <td className="border px-2 py-1">{t.weHold || "-"}</td>

                        <td className="border px-2 py-1">
                          {t.received || "-"}
                        </td>

                        <td className="border px-2 py-1">
                          {t.receivedFrom || "-"}
                        </td>

                        <td className="border px-2 py-1">{t.heldBy || "-"}</td>

                        <td className="border px-2 py-1">
                          {t.depositDate || t.date || "-"}
                        </td>

                        <td className="border px-2 py-1">
                          {t.reference || "-"}
                        </td>

                        <td className="border px-2 py-1">
                          {formatCurrency(t.amount || "-")}
                        </td>

                        <td className="border px-2 py-1">
                          {t.paymentType || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-gray-500">No trust records.</div>
              )}
            </div>

            {/* Conditions Section */}

            <div className="mb-6">
              <h3 className="font-semibold text-lg mb-2">Conditions</h3>

              {trade.conditions && trade.conditions.length > 0 ? (
                <table className="min-w-full border border-gray-300 mb-2 text-sm">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Condition
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Due Date
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Condition Met Date
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {trade.conditions.map((condition, idx) => (
                      <tr key={idx}>
                        <td className="border px-2 py-1">
                          {condition.conditionText || "-"}
                        </td>

                        <td className="border px-2 py-1">
                          {condition.dueDate || "-"}
                        </td>

                        <td className="border px-2 py-1">
                          {condition.conditionMetDate || "Not met"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-gray-500">No conditions available.</div>
              )}
            </div>

            {/* Commission Section */}

            <div className="mb-6">
              <h3 className="font-semibold text-lg mb-2">Commission Details</h3>

              {trade.commission && (
                <>
                  <div className="mb-4">
                    <h4 className="text-gray-700 mb-1">Sale Closing Rows</h4>

                    {renderTable(trade.commission.saleClosingRows)}
                  </div>

                  <div className="mb-4">
                    <h4 className="text-gray-700 mb-1">
                      Commission Income Rows
                    </h4>

                    {renderTable(trade.commission.commissionIncomeRows)}
                  </div>

                  <div className="mb-4">
                    <h4 className="text-gray-700 mb-1">Outside Brokers Rows</h4>

                    {renderTable(trade.commission.outsideBrokersRows)}
                  </div>
                </>
              )}
            </div>

            {/* Agent Commission Info Section */}

            <div className="mb-6">
              <h3 className="font-semibold text-lg mb-2">
                Agent Commission Info
              </h3>

              {trade.agentCommissionList &&
              trade.agentCommissionList.length > 0 ? (
                <table className="min-w-full border border-gray-300 mb-2 text-sm">
                  <thead>
                    <tr>
                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Agent Name
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Classification
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Amount
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Net Commission
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Lead
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Fee Info
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Total Fees
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Tax
                      </th>

                      <th className="px-2 py-1 text-left bg-gray-100 border">
                        Total
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {trade.agentCommissionList.map((a, idx) => (
                      <tr key={idx}>
                        <td className="border px-2 py-1">{a.agentName}</td>

                        <td className="border px-2 py-1">{a.classification}</td>

                        <td className="border px-2 py-1">
                          {formatCurrency(a.amount)}
                        </td>

                        <td className="border px-2 py-1">
                          {formatCurrency(a.netCommission)}
                        </td>

                        <td className="border px-2 py-1">{a.lead}</td>

                        <td className="border px-2 py-1">
                          {getPaymentPlanDisplayName(a.feeInfo)}
                        </td>

                        <td className="border px-2 py-1">
                          {formatCurrency(a.totalFees)}
                        </td>

                        <td className="border px-2 py-1">
                          {formatCurrency(a.tax)}
                        </td>

                        <td className="border px-2 py-1">
                          {formatCurrency(a.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-gray-500">No agent commission data.</div>
              )}
            </div>

            {/* EFT Payment Tables Section */}

            <EFTPaymentTables trade={trade} />

            {/* Transaction Details Section */}

            {/* Removed Trade Finalize and Payment Received tables as requested */}
          </>
        )}
      </div>
    </div>
  );
};

export default TradeDetailsModal;
