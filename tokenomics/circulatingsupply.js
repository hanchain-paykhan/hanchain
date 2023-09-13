const Web3 = require("web3");
const http = require("http");
const Web3HttpProvider = require("web3-providers-http");
const express = require('express');
const router = express.Router();
const BigNumber = require('bignumber.js');
const mysql = require('mysql2');

const connection = mysql.createConnection({
  host     : {},
  user     : {},
  password : {},
  database : {}
});

const options = {
  keepAlive: true,
  timeout: 100000,
  headers: [{ name: "Access-Control-Allow-Origin", value: "*" }],
  withCredentials: false,
  agent: new http.Agent({ keepAlive: true }),
};

// Web3 End Point 
const Main_RPC_URL="https://mainnet.infura.io/v3/{env.key}";
const OPTIMISM_RPC_URL="https://optimism-mainnet.infura.io/v3/{env.key}";

// Mainnet Contract Address 
const hancainMainNetCA="0x0c90C57aaf95A3A87eadda6ec3974c99D786511F";
const munieMainNetCA="0x03d32959696319026bbDe564F128eB110AAbe7aF";
const sheepooriMainNetCA="0xcee864b8633b96f5542f25e0b9942bf7557cc5c3";

// Mainnet ABI
const MainHANABI=require("./abi/han/main/hancahin");
const MainMunieABI=require("./abi/han/main/mainmunie");
const MainStakingSPR=require("./abi/han/main/sheepoori");

// Optimism Contract Addresss 
const hanchainOptCA="0x50Bce64397C75488465253c0A034b8097FeA6578";
const hanBonusStakingOptCA="0x147534dC273e358632AdeD0a74265F70229512dC";
const musikhanStakingOptCA="0x5AD7e2BF0204C066ac9C3DD7028cE30B41D12682";
const privateStakingOptProxyCA='0x3fa8CEE6795220Ac25DD35D4d39ec306a3e4fb3f';



// Optimism ABI 
const OptHanABI = require("./abi/han/optimism/hancahin");
const OptPrivateStakingABI = require("./abi/han/optimism/privateStaking");
const OptHanBonusStaking = require("./abi/han/optimism/hanBonusStaking");
const OptMusikhanStakingABI=require("./abi/han/optimism/musikhanStaking");

// Web3 Network Connection 
const optProvider = new Web3HttpProvider(OPTIMISM_RPC_URL, options);
const mainProvider = new Web3HttpProvider(Main_RPC_URL, options);
const oweb3 = new Web3(optProvider);
const mweb3 = new Web3(mainProvider);


router.get("/totalsupply", async function (req, res, next) {
  let webTotalSupply = await getMainHanChainTotalSupply();
  let b = new BigNumber(webTotalSupply);
  res.send(b.div(new BigNumber(10).pow(new BigNumber(18))).toString(10));
});

router.get("/totalSupply", async function (req, res, next) {
  let webTotalSupply = await getMainHanEpChainTotalSupply();
  let b = new BigNumber(webTotalSupply);
  res.send(b.div(new BigNumber(10).pow(new BigNumber(18))).toString(10));
});


router.get('/han',async function(req,res,next){
  // Total Supply : 1.5 billion 
  // wei : 1500000000000000000000000000
  // ether : 1500000000
  let totalSupply=new BigNumber(1500000000000000000000000000);

  let subHanChainAmount =await getHanchainTokenSubValue();
   totalSupply = totalSupply.minus(subHanChainAmount);

  let addStakingMunie= await getMainStakingMunie();
   totalSupply = totalSupply.plus(addStakingMunie);

  let addSpr = await getMainStakingSPR();
   totalSupply = totalSupply.plus(addSpr);

  let hanBonusStakingTotal = await getOptHanBonusStaking();
   totalSupply=totalSupply.plus(hanBonusStakingTotal);

  let  otpmusikhanStaking = await getOptMusikhanStaking();
   totalSupply=totalSupply.plus(otpmusikhanStaking);

  let privateStakingAmount= await getOptPrivateStakingAddValue();
   totalSupply=totalSupply.plus(privateStakingAmount);

  let subHanChacinOtpAmount = await getOptHanchainTokenSubValue();
   totalSupply = totalSupply.minus(subHanChacinOtpAmount);

  // wei to ether
  let ethResult = totalSupply.div(new BigNumber(10).pow(new BigNumber(18))).toString(10);
  
  // insert DB
  var sql = 'INSERT INTO han_circulation(circulation,c_date) VALUES(?, now())';
  let circulation  = ethResult;
  var params = [circulation];
  connection.query(sql, params, function(err, rows, fields){
      if(err) console.log(err);
      let result= "INSERTSUCCESS";
      res.send({result:result});
  });
});


/****************************************************
 Mainnet Process   
****************************************************/

async function getMainHanChainTotalSupply() {
  const mainHanContract = await new mweb3.eth.Contract(MainHANABI.HAN_ABI, hancainMainNetCA);
  console.log(mainHanContract);
  const result = await mainHanContract.methods.totalSupply().call();
  console.log(result);
  return result;
}

async function getMainHanEpChainTotalSupply() {
  const mainHanContract = await new mweb3.eth.Contract(MainHANEPABI.ABI, mHancainEpMainNetCA);
  console.log(mainHanContract);
  const result = await mainHanContract.methods.totalSupply().call();
  console.log(result);
  return result;
}


async function getHanchainTokenSubValue(){
  let addr_list=[ '0x495fcd7f56a0bf8be1f29be02d1aa5f492f2ff66','0x19681f34afce6b7fadfb07cd34c8f20dcf0a4f2a',
                  '0x90a692e0819075c49100f9f5f2724e75d8a34711', '0xc7bdbcda0b8162427868ac41713d2559a9e2281c','0x3811f5674abbc216ad29a1edcdd0b05172a9f123',  
                  '0x7364f19d1db8babfd1a9df5da7ee8488d8cc9592', '0xef66cf0f03ee87165eb9f7a785c8fdadae916d32'];
  let sub_total = new BigNumber(0);
  for(let i=0;i<addr_list.length;i++){
    sub_total = sub_total.plus(await getMainHanchainBalanceByAddress(addr_list[i]));
  }
  return sub_total;
}

async function getMainHanchainBalanceByAddress(ownerAddress){
  const mainHanContract = await new mweb3.eth.Contract(MainHANABI.HAN_ABI, hancainMainNetCA);
  const result = await mainHanContract.methods.balanceOf(ownerAddress).call();
  return new BigNumber(result);
}

async function getMainStakingMunie(){
  const muxValue=new BigNumber(36500000000000000000);
  const ownerAddr="0x7364f19d1db8babfd1a9df5da7ee8488d8cc9592";
  const mainStakingMunieContract = await new mweb3.eth.Contract(MainMunieABI.MainMunieABI , munieMainNetCA);
  let result =await mainStakingMunieContract.methods.balanceOf(ownerAddr).call();
  let serverReturnValue = new BigNumber(result) ;
  const resultBig=muxValue.multipliedBy(serverReturnValue);
  return resultBig ;
}

async function getMainStakingSPR(){
 const muxValue=new BigNumber(36500000000000000000);
 const ownerAddr="0xef66cf0f03ee87165eb9f7a785c8fdadae916d32";
 const mainSprContract = await new mweb3.eth.Contract(MainStakingSPR.SHEEPOORIABI,sheepooriMainNetCA);
 let result =await mainSprContract.methods.balanceOf(ownerAddr).call();
 let serverReturnValue = new BigNumber(result) ;
 const resultBig=muxValue.multipliedBy(serverReturnValue);
 return resultBig;
}

/***********************************************************************************
 Optimism Process 
***********************************************************************************/

async function getOptHanchainTokenSubValue(){
  let opt_addr_list=['0x147534dc273e358632aded0a74265f70229512dc','0x5ad7e2bf0204c066ac9c3dd7028ce30b41d12682','0xd6d4eaaed79f618bcd0ea12dbdf45bb654287415',
                    '0x96ea5e0255dafe9825210f1375826fa4f0de1e8c'];
  let opt_sub_total=new BigNumber(0);
  for(let i=0; i<opt_addr_list.length;i++){
    opt_sub_total = opt_sub_total.plus(await getMainHanchainBalanceOptByAddress(opt_addr_list[i]));
  }
  return opt_sub_total;
}

async function getMainHanchainBalanceOptByAddress(ownerAddress){
  const otpHanContract = await new oweb3.eth.Contract(OptHanABI.OTP_HAN_ABI, hanchainOptCA);
  const result = await otpHanContract.methods.balanceOf(ownerAddress).call();
  return new BigNumber(result);
}

async function getOptHanBonusStaking(){
  const muxValue=new BigNumber(1.36201209998832);
  const otpHanBonusStakingContract= await new oweb3.eth.Contract(OptHanBonusStaking.ABI,hanBonusStakingOptCA);
  const serverReturnValue = await otpHanBonusStakingContract.methods.totalSupply().call();
  const resultBig=muxValue.multipliedBy(new BigNumber(serverReturnValue));
  return resultBig;

}

async function getOptMusikhanStaking(){
  const muxValue=new BigNumber(0.07300000000584);
  const otpMusikhanStakingContract= await new oweb3.eth.Contract(OptMusikhanStakingABI.ABI,musikhanStakingOptCA);
  const serverReturnValue = await otpMusikhanStakingContract.methods.totalSupply().call();
  const resultBig=muxValue.multipliedBy(new BigNumber(serverReturnValue));
  return resultBig;
}

async function getOptPrivateStakingAddValue(){  
  let opt_addr_list=['0xd6d4eaaed79f618bcd0ea12dbdf45bb654287415','0x96ea5e0255dafe9825210f1375826fa4f0de1e8c'];
  let opt_sub_total= new BigNumber(0);
  for(let i=0;i<opt_addr_list.length;i++){
    opt_sub_total = opt_sub_total.plus(await getOptPrivateStakingValueByAddress(opt_addr_list[i]));
  }
  return opt_sub_total;
}

async function getOptPrivateStakingValueByAddress(ownerAddr){
  let muxValue=new BigNumber(1.52778374045482);
  if(ownerAddr=='0x96ea5e0255dafe9825210f1375826fa4f0de1e8c'){
    muxValue=new BigNumber(8.67113146862582);
  } 
  const optPrivateStakingContract= await new oweb3.eth.Contract(OptPrivateStakingABI.PrivateRakisABI,privateStakingOptProxyCA);
  const result = await optPrivateStakingContract.methods.balanceOf(ownerAddr).call();
  return muxValue.multipliedBy(new BigNumber(result));
}

// comming soon HANeP BONUS STAKING 
async function getHanePBonusStaking(){
  let muxValue=new BigNumber(40.00000000001310);
  const optHanePBonusContract = await new oweb3.eth.Contract(TESTABI,TESTCA);
  const result= await optHanePBonusContract.methods.totalSupply().call();
  return new BigNumber(result);
}
module.exports = router;
