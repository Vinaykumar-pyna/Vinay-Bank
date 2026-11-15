/** Target namespace of the ArthaBank SOAP service. */
export const SOAP_NAMESPACE = 'urn:arthabank:soap:banking:1';

/**
 * WSDL 1.1 contract (document/literal, SOAP 1.1) for partner integrations
 * such as a corporate customer's ERP. The XSD types constrain inputs (for
 * example the 12-digit account number) before any code runs.
 */
export function bankingWsdl(location: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions name="ArthaBankService"
  targetNamespace="${SOAP_NAMESPACE}"
  xmlns="http://schemas.xmlsoap.org/wsdl/"
  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
  xmlns:tns="${SOAP_NAMESPACE}"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema">

  <documentation>ArthaBank partner banking service. Requests must carry a WS-Security UsernameToken (PasswordDigest recommended).</documentation>

  <types>
    <xsd:schema targetNamespace="${SOAP_NAMESPACE}" elementFormDefault="qualified">
      <xsd:simpleType name="AccountNumber">
        <xsd:restriction base="xsd:string"><xsd:pattern value="[0-9]{12}"/></xsd:restriction>
      </xsd:simpleType>
      <xsd:simpleType name="Ifsc">
        <xsd:restriction base="xsd:string"><xsd:pattern value="[A-Z]{4}0[A-Z0-9]{6}"/></xsd:restriction>
      </xsd:simpleType>

      <xsd:element name="GetAccountBalanceRequest">
        <xsd:complexType><xsd:sequence>
          <xsd:element name="AccountNumber" type="tns:AccountNumber"/>
        </xsd:sequence></xsd:complexType>
      </xsd:element>
      <xsd:element name="GetAccountBalanceResponse">
        <xsd:complexType><xsd:sequence>
          <xsd:element name="AccountNumber" type="xsd:string"/>
          <xsd:element name="AccountType" type="xsd:string"/>
          <xsd:element name="Status" type="xsd:string"/>
          <xsd:element name="Currency" type="xsd:string"/>
          <xsd:element name="LedgerBalance" type="xsd:decimal"/>
          <xsd:element name="AvailableBalance" type="xsd:decimal"/>
          <xsd:element name="AsOf" type="xsd:dateTime"/>
        </xsd:sequence></xsd:complexType>
      </xsd:element>

      <xsd:complexType name="StatementEntry">
        <xsd:sequence>
          <xsd:element name="Date" type="xsd:dateTime"/>
          <xsd:element name="Reference" type="xsd:string"/>
          <xsd:element name="Narration" type="xsd:string"/>
          <xsd:element name="Direction" type="xsd:string"/>
          <xsd:element name="Amount" type="xsd:decimal"/>
          <xsd:element name="BalanceAfter" type="xsd:decimal"/>
        </xsd:sequence>
      </xsd:complexType>
      <xsd:element name="GetMiniStatementRequest">
        <xsd:complexType><xsd:sequence>
          <xsd:element name="AccountNumber" type="tns:AccountNumber"/>
          <xsd:element name="Count" type="xsd:int" minOccurs="0"/>
        </xsd:sequence></xsd:complexType>
      </xsd:element>
      <xsd:element name="GetMiniStatementResponse">
        <xsd:complexType><xsd:sequence>
          <xsd:element name="AccountNumber" type="xsd:string"/>
          <xsd:element name="Entry" type="tns:StatementEntry" minOccurs="0" maxOccurs="20"/>
        </xsd:sequence></xsd:complexType>
      </xsd:element>

      <xsd:element name="ValidateIfscRequest">
        <xsd:complexType><xsd:sequence>
          <xsd:element name="Ifsc" type="tns:Ifsc"/>
        </xsd:sequence></xsd:complexType>
      </xsd:element>
      <xsd:element name="ValidateIfscResponse">
        <xsd:complexType><xsd:sequence>
          <xsd:element name="Ifsc" type="xsd:string"/>
          <xsd:element name="Valid" type="xsd:boolean"/>
          <xsd:element name="Bank" type="xsd:string"/>
          <xsd:element name="Branch" type="xsd:string"/>
          <xsd:element name="Source" type="xsd:string"/>
        </xsd:sequence></xsd:complexType>
      </xsd:element>
    </xsd:schema>
  </types>

  <message name="GetAccountBalanceInput"><part name="parameters" element="tns:GetAccountBalanceRequest"/></message>
  <message name="GetAccountBalanceOutput"><part name="parameters" element="tns:GetAccountBalanceResponse"/></message>
  <message name="GetMiniStatementInput"><part name="parameters" element="tns:GetMiniStatementRequest"/></message>
  <message name="GetMiniStatementOutput"><part name="parameters" element="tns:GetMiniStatementResponse"/></message>
  <message name="ValidateIfscInput"><part name="parameters" element="tns:ValidateIfscRequest"/></message>
  <message name="ValidateIfscOutput"><part name="parameters" element="tns:ValidateIfscResponse"/></message>

  <portType name="ArthaBankPortType">
    <operation name="GetAccountBalance">
      <input message="tns:GetAccountBalanceInput"/>
      <output message="tns:GetAccountBalanceOutput"/>
    </operation>
    <operation name="GetMiniStatement">
      <input message="tns:GetMiniStatementInput"/>
      <output message="tns:GetMiniStatementOutput"/>
    </operation>
    <operation name="ValidateIfsc">
      <input message="tns:ValidateIfscInput"/>
      <output message="tns:ValidateIfscOutput"/>
    </operation>
  </portType>

  <binding name="ArthaBankBinding" type="tns:ArthaBankPortType">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="GetAccountBalance">
      <soap:operation soapAction="${SOAP_NAMESPACE}#GetAccountBalance"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="GetMiniStatement">
      <soap:operation soapAction="${SOAP_NAMESPACE}#GetMiniStatement"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
    <operation name="ValidateIfsc">
      <soap:operation soapAction="${SOAP_NAMESPACE}#ValidateIfsc"/>
      <input><soap:body use="literal"/></input>
      <output><soap:body use="literal"/></output>
    </operation>
  </binding>

  <service name="ArthaBankService">
    <port name="ArthaBankPort" binding="tns:ArthaBankBinding">
      <soap:address location="${location}"/>
    </port>
  </service>
</definitions>
`;
}
